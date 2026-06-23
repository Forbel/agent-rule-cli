#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(REPO_ROOT, 'agent-rules-init.cjs')
const { calculateManifestModule } = require('../src/verify-core.cjs')
const { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS } = require('../src/constants.cjs')

const tests = []

function test(name, fn) {
  tests.push({ name, fn })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertIncludes(text, expected, label) {
  assert(text.indexOf(expected) >= 0, `${label || 'output'} should include "${expected}".\nActual output:\n${text}`)
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function write(file, content) {
  mkdirp(path.dirname(file))
  fs.writeFileSync(file, content)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function makeTempProject(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `agent-rule-cli-${name}-`))
  return root
}

function cleanup(root) {
  if (!root || !fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) cleanup(full)
    else fs.unlinkSync(full)
  }
  fs.rmdirSync(root)
}

function runCli(args, options) {
  const result = spawnSync(process.execPath, [CLI].concat(args), {
    cwd: options && options.cwd ? options.cwd : REPO_ROOT,
    encoding: 'utf8'
  })
  result.outputText = `${result.stdout || ''}${result.stderr || ''}`
  return result
}

function generate(root) {
  const result = runCli(['--defaults', '--root', root])
  assert(result.status === 0, `generate should exit 0, got ${result.status}\n${result.outputText}`)
  return result
}

function verify(root) {
  return runCli(['--verify', '--root', root])
}

function assertVerifyOk(root) {
  const result = verify(root)
  assert(result.status === 0, `verify should exit 0, got ${result.status}\n${result.outputText}`)
  return result
}

function assertVerifyFails(root, expected) {
  const result = verify(root)
  assert(result.status === 1, `verify should exit 1, got ${result.status}\n${result.outputText}`)
  assertIncludes(result.outputText, expected, 'verify output')
  return result
}

test('prints help', () => {
  const result = runCli(['--help'])
  assert(result.status === 0, `help should exit 0, got ${result.status}\n${result.outputText}`)
  assertIncludes(result.outputText, '用法：', 'help output')
  assertIncludes(result.outputText, 'npx agent-rule-cli', 'help output')
})

test('unit tests manifest coverage calculation without running CLI', () => {
  const manifest = {
    modules: {},
    facts: [
      { id: 'project.name', module: 'architecture', value: 'Demo', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'project.description', module: 'architecture', value: 'Demo project', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'project.kind', module: 'architecture', value: 'existing', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'project.scope', module: 'architecture', value: 'frontend', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'stack.technologies', module: 'architecture', value: 'Vue', status: 'confirmed', source: 'package.json:vue', verifiedAt: '2026-06-23' },
      { id: 'policy.directoryBoundaries', module: 'architecture', value: '遵循现有目录边界', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'policy.newDirectories', module: 'architecture', value: '新增目录需确认', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'policy.featureBoundary', module: 'architecture', value: '按业务域划分', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' },
      { id: 'project.outputLanguage', module: 'architecture', value: '中文', status: 'user-confirmed', source: 'test', verifiedAt: '2026-06-23' }
    ]
  }

  const result = calculateManifestModule('architecture', manifest, { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS })

  assert(result.status === 'configured', `architecture should be configured, got ${result.status}`)
  assert(result.missing.length === 0, `architecture should have no missing coverage, got ${result.missing.join(', ')}`)
  assert(result.dimensions.strategy === 'configured', `strategy should be configured, got ${result.dimensions.strategy}`)
  assert(result.dimensions.repositoryFacts === 'partial', `repository facts should be partial, got ${result.dimensions.repositoryFacts}`)
  assert(result.dimensions.businessContracts === 'not-applicable', `business contracts should be not-applicable, got ${result.dimensions.businessContracts}`)
})

test('generates and verifies a frontend fixture', () => {
  const root = makeTempProject('frontend')
  try {
    mkdirp(path.join(root, 'pages'))
    mkdirp(path.join(root, 'src/components'))
    generate(root)
    assert(fs.existsSync(path.join(root, 'AGENTS.md')), 'AGENTS.md should be generated')
    assert(fs.existsSync(path.join(root, '.agent-rules/project-ui-rules.md')), 'frontend project should include UI project rules')
    assert(fs.existsSync(path.join(root, '.agent-rules/shared-ui-rules.md')), 'frontend project should include UI shared rules')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('records non-git repository status clearly', () => {
  const root = makeTempProject('nongit')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const gitRules = fs.readFileSync(path.join(root, '.agent-rules/project-git-delivery.md'), 'utf8')
    assertIncludes(gitRules, '当前目录不是 Git 仓库', 'project git rules')
    assertIncludes(gitRules, 'Git 仓库状态：否', 'project git rules')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('generates mandatory confirmation rule for undefined business semantics', () => {
  const root = makeTempProject('business-confirmation')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const index = fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8')
    const business = fs.readFileSync(path.join(root, '.agent-rules/project-business-rules.md'), 'utf8')
    assertIncludes(index, '必须先向用户确认', 'project index')
    assertIncludes(index, '不得根据字段名、页面文案、代码现状或模型常识自行推断', 'project index')
    assertIncludes(business, '必须先向用户确认', 'project business rules')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('verify detects git repository status changes', () => {
  const root = makeTempProject('git-status-change')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    mkdirp(path.join(root, '.git'))
    assertVerifyFails(root, 'Git 仓库状态已变化，需要重新生成：git.repository')
  } finally {
    cleanup(root)
  }
})

test('generates backend fixture without UI rules and with backend project rules', () => {
  const root = makeTempProject('backend')
  try {
    write(path.join(root, 'go.mod'), 'module example.com/backend\n')
    mkdirp(path.join(root, 'cmd'))
    mkdirp(path.join(root, 'internal/handlers'))
    mkdirp(path.join(root, 'internal/services'))
    mkdirp(path.join(root, 'internal/repositories'))
    mkdirp(path.join(root, 'migrations'))
    generate(root)
    assert(fs.existsSync(path.join(root, '.agent-rules/project-backend-api-contracts.md')), 'backend project rules should be generated')
    assert(!fs.existsSync(path.join(root, '.agent-rules/project-ui-rules.md')), 'backend project should not include UI project rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/shared-ui-rules.md')), 'backend project should not include UI shared rules')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('verify detects generated artifact drift', () => {
  const root = makeTempProject('artifact-drift')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const file = path.join(root, '.agent-rules/project-architecture.md')
    fs.appendFileSync(file, '\nmanual drift\n')
    assertVerifyFails(root, '生成产物已漂移：.agent-rules/project-architecture.md')
  } finally {
    cleanup(root)
  }
})

test('verify detects shared template drift', () => {
  const root = makeTempProject('shared-drift')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const file = path.join(root, '.agent-rules/shared-code-quality.md')
    fs.appendFileSync(file, '\nmanual drift\n')
    assertVerifyFails(root, 'shared 模板发生漂移：shared-code-quality.md')
  } finally {
    cleanup(root)
  }
})

test('verify detects evidence content drift', () => {
  const root = makeTempProject('evidence-drift')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({
      name: 'evidence-drift',
      dependencies: { vue: '^2.7.0', axios: '^1.0.0' }
    }, null, 2))
    mkdirp(path.join(root, 'src/views'))
    generate(root)
    write(path.join(root, 'package.json'), JSON.stringify({
      name: 'evidence-drift',
      dependencies: { vue: '^3.0.0', axios: '^1.0.0' }
    }, null, 2))
    assertVerifyFails(root, '事实来源已变化，需要重新生成')
  } finally {
    cleanup(root)
  }
})

test('verify detects module coverage tampering', () => {
  const root = makeTempProject('coverage-tamper')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const manifestFile = path.join(root, '.agent-rules/project-facts.json')
    const manifest = readJson(manifestFile)
    manifest.modules.architecture.coverage = manifest.modules.architecture.coverage.slice(0, 1)
    writeJson(manifestFile, manifest)
    assertVerifyFails(root, '模块 coverage catalog 不完整：architecture')
  } finally {
    cleanup(root)
  }
})

test('verify detects invalid fact schema', () => {
  const root = makeTempProject('schema-invalid')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const manifestFile = path.join(root, '.agent-rules/project-facts.json')
    const manifest = readJson(manifestFile)
    manifest.facts.push({
      id: 'bad.status',
      module: 'architecture',
      value: 'bad',
      status: 'bad-status',
      source: 'test',
      evidence: 'test',
      verifiedAt: '2026-06-23'
    })
    writeJson(manifestFile, manifest)
    assertVerifyFails(root, 'fact 状态非法：bad.status -> bad-status')
  } finally {
    cleanup(root)
  }
})

let failures = 0

for (const item of tests) {
  try {
    item.fn()
    process.stdout.write(`✓ ${item.name}\n`)
  } catch (error) {
    failures += 1
    process.stderr.write(`✗ ${item.name}\n${error.stack || error.message}\n`)
  }
}

if (failures) {
  process.stderr.write(`\n${failures} test(s) failed.\n`)
  process.exit(1)
}

process.stdout.write(`\n${tests.length} tests passed.\n`)
