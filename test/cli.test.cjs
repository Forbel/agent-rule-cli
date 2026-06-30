#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(REPO_ROOT, 'agent-rules-init.cjs')
const FIXTURE_ROOT = path.join(REPO_ROOT, 'test', 'fixtures')
const { calculateManifestModule } = require('../src/verify-core.cjs')
const { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS } = require('../src/constants.cjs')
const { ui } = require('../src/context.cjs')
const { makeReadline } = require('../src/wizard.cjs')

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

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start)
  if (startIndex < 0) return ''
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1
  return text.slice(startIndex, endIndex >= 0 ? endIndex : undefined)
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

function copyFixtureProject(name) {
  const root = makeTempProject(`fixture-${name}`)
  const source = path.join(FIXTURE_ROOT, name)
  const copy = (from, to) => {
    mkdirp(to)
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const sourcePath = path.join(from, entry.name)
      const targetPath = path.join(to, entry.name)
      if (entry.isDirectory()) copy(sourcePath, targetPath)
      else fs.copyFileSync(sourcePath, targetPath)
    }
  }
  copy(source, root)
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
    encoding: 'utf8',
    input: options && options.input !== undefined ? options.input : undefined
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

function doctor(root) {
  return runCli(['--doctor', '--root', root])
}

function diffRules(root) {
  return runCli(['--diff', '--root', root])
}

function semanticsCheck(root) {
  return runCli(['--semantics', 'check', '--root', root])
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
  assertIncludes(result.outputText, '--enrich', 'help output')
  assertIncludes(result.outputText, '--doctor', 'help output')
  assertIncludes(result.outputText, '--diff', 'help output')
  assertIncludes(result.outputText, '--migrate', 'help output')
  assertIncludes(result.outputText, '--profile', 'help output')
  assertIncludes(result.outputText, '--semantics', 'help output')
})

test('makeReadline resets closed state for repeated confirmations', () => {
  ui.closed = true
  makeReadline()
  assert(ui.closed === false, 'makeReadline should clear stale closed state before asking again')
  ui.rl.close()
  ui.closed = false
  ui.queue = []
  ui.waiter = null
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
    const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
    const factsSection = sectionBetween(apiRules, '## 已确认实现事实', '## 已知实现差距')
    assert(factsSection.indexOf('统一请求入口：未定义') < 0, 'frontend without API should mark API entry as not-applicable instead of undefined')
    assert(factsSection.indexOf('请求库：未定义') < 0, 'frontend without API should mark API library as not-applicable instead of undefined')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('rules index references every generated project and shared rule', () => {
  const root = makeTempProject('rule-routing')
  try {
    mkdirp(path.join(root, 'pages'))
    mkdirp(path.join(root, 'src/components'))
    generate(root)
    const entryText = [
      fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'),
      fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8')
    ].join('\n')
    const files = fs.readdirSync(path.join(root, '.agent-rules'))
      .filter(file => /^project-.*\.(md|json)$/.test(file) || /^shared-.*\.md$/.test(file) || file === 'semantic-workflow.md')
      .filter(file => file !== 'project-facts.json')
      .sort()
    for (const file of files) {
      assertIncludes(entryText, file, `${file} should be reachable from AGENTS.md or project-index.md`)
    }
  } finally {
    cleanup(root)
  }
})

test('minimal profile generates a compact rule set without dangling index references', () => {
  const root = makeTempProject('profile-minimal')
  try {
    mkdirp(path.join(root, 'pages'))
    const result = runCli(['--profile', 'minimal', '--defaults', '--root', root])
    assert(result.status === 0, `minimal profile should exit 0, got ${result.status}\n${result.outputText}`)
    assert(fs.existsSync(path.join(root, '.agent-rules/project-architecture.md')), 'minimal should include architecture rules')
    assert(fs.existsSync(path.join(root, '.agent-rules/project-code-quality.md')), 'minimal should include code quality rules')
    assert(fs.existsSync(path.join(root, '.agent-rules/project-testing-quality-gates.md')), 'minimal should include testing rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/project-ui-rules.md')), 'minimal should skip UI project rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/project-api-error-handling.md')), 'minimal should skip API project rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/project-state-data-flow.md')), 'minimal should skip state project rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/shared-ui-rules.md')), 'minimal should skip UI shared rules')
    assert(!fs.existsSync(path.join(root, '.agent-rules/shared-api-error-handling.md')), 'minimal should skip API shared rules')
    const index = fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8')
    assertIncludes(index, '规则 profile：minimal', 'minimal index')
    assert(index.indexOf('project-ui-rules.md') < 0, 'minimal index must not reference skipped UI rules')
    assert(index.indexOf('project-api-error-handling.md') < 0, 'minimal index must not reference skipped API rules')
    const manifest = readJson(path.join(root, '.agent-rules/project-facts.json'))
    assert(manifest.ruleProfile === 'minimal', 'manifest should record the minimal profile')
    assert(manifest.sharedTemplates.includes('shared-code-quality.md'), 'minimal manifest should include code quality shared template')
    assert(!manifest.sharedTemplates.includes('shared-ui-rules.md'), 'minimal manifest should not include UI shared template')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('strict profile treats generation warnings as strict verification failures', () => {
  const root = makeTempProject('profile-strict')
  try {
    mkdirp(path.join(root, 'pages'))
    const result = runCli(['--profile', 'strict', '--defaults', '--root', root])
    assert(result.status === 2, `strict profile should exit 2 on warnings, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '校验完成：无结构错误，但仍有需要处理的警告。', 'strict profile output')
    const manifest = readJson(path.join(root, '.agent-rules/project-facts.json'))
    assert(manifest.ruleProfile === 'strict', 'manifest should record the strict profile')
  } finally {
    cleanup(root)
  }
})

test('doctor reports healthy generated rules', () => {
  const root = makeTempProject('doctor-ok')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const result = doctor(root)
    assert(result.status === 0, `doctor should exit 0, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '通过：规则目录结构', 'doctor output')
  } finally {
    cleanup(root)
  }
})

test('diff and doctor report generated artifact drift', () => {
  const root = makeTempProject('maintenance-drift')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    write(path.join(root, '.agent-rules/project-index.md'), '# manually edited\n')
    const diff = diffRules(root)
    assert(diff.status === 0, `diff should exit 0, got ${diff.status}\n${diff.outputText}`)
    assertIncludes(diff.outputText, 'project-index.md', 'diff output')
    assertIncludes(diff.outputText, 'changed', 'diff output')
    const diagnosis = doctor(root)
    assert(diagnosis.status === 0, `doctor should warn but exit 0 for drift, got ${diagnosis.status}\n${diagnosis.outputText}`)
    assertIncludes(diagnosis.outputText, '生成产物已修改：.agent-rules/project-index.md', 'doctor output')
  } finally {
    cleanup(root)
  }
})

test('migrate rebuilds generated artifacts and preserves curated files', () => {
  const root = makeTempProject('migrate')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    write(path.join(root, '.agent-rules/project-custom.md'), '# Custom\n\n- keep me\n')
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [{
        id: 'demo.rule',
        domain: 'demo',
        statement: 'keep semantic entry',
        status: 'inferred',
        verifiedAt: '2026-06-30'
      }]
    })
    write(path.join(root, '.agent-rules/project-index.md'), '# drift\n')
    const result = runCli(['--migrate', '--root', root])
    assert(result.status === 0, `migrate should exit 0, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '已迁移并重新生成规则', 'migrate output')
    const index = fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8')
    assertIncludes(index, '# 规则索引', 'migrate should rebuild project-index')
    assertIncludes(fs.readFileSync(path.join(root, '.agent-rules/project-custom.md'), 'utf8'), 'keep me', 'migrate should preserve custom rules')
    const semantics = readJson(path.join(root, '.agent-rules/project-semantics.json'))
    assert(semantics.entries.some(entry => entry.id === 'demo.rule'), 'migrate should preserve semantic entries')
    assert(fs.readdirSync(root).some(file => file.startsWith('.agent-rules.backup-')), 'migrate should create a backup')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('fixture matrix generates and verifies representative project shapes', () => {
  const cases = [
    {
      name: 'next-app-router',
      checks(root) {
        const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
        const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
        assertIncludes(architecture, '页面目录：src/app', 'next architecture')
        assertIncludes(architecture, 'API / service 目录：src/app/api', 'next architecture')
        assertIncludes(architecture, 'Server Actions 目录：src/lib/actions', 'next architecture')
        assertIncludes(map, 'orders：`src/app/orders`', 'next domain map')
        assert(map.indexOf('page：`src/app/page.tsx`') < 0, 'next domain map should omit App Router framework files')
      }
    },
    {
      name: 'vite-react',
      checks(root) {
        const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
        const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
        assertIncludes(architecture, '`React`', 'vite architecture')
        assertIncludes(architecture, '`Vite`', 'vite architecture')
        assertIncludes(architecture, '页面目录：src/pages', 'vite architecture')
        assertIncludes(apiRules, '统一请求入口：src/api/client.ts', 'vite api rules')
      }
    },
    {
      name: 'express-api',
      checks(root) {
        const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
        const backendRules = path.join(root, '.agent-rules/project-backend-api-contracts.md')
        assert(fs.existsSync(backendRules), 'express fixture should generate backend rules')
        assertIncludes(apiRules, '请求库：Express', 'express api rules')
        assertIncludes(apiRules, '当前显式处理的 HTTP 状态：`500`', 'express api rules')
      }
    },
    {
      name: 'fastapi',
      checks(root) {
        const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
        const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
        assertIncludes(apiRules, '请求库：FastAPI', 'fastapi api rules')
        assertIncludes(architecture, '后端入口目录：app', 'fastapi architecture')
        assert(fs.existsSync(path.join(root, '.agent-rules/project-backend-data-persistence.md')), 'fastapi fixture should generate backend persistence rules')
      }
    }
  ]

  for (const item of cases) {
    const root = copyFixtureProject(item.name)
    try {
      generate(root)
      assertVerifyOk(root)
      item.checks(root)
    } finally {
      cleanup(root)
    }
  }
})

test('enrich generates an AI handoff task and adapter', () => {
  const root = makeTempProject('enrich-task')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'enrich-task', dependencies: { react: '^18.0.0' } }, null, 2))
    mkdirp(path.join(root, 'pages'))
    const result = runCli(['--enrich', '--root', root])
    assert(result.status === 0, `enrich should exit 0, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '::agent-rule-cli-enrich', 'enrich output should include machine-readable handoff')
    assert(fs.existsSync(path.join(root, '.agent-rules/ai-enrichment-task.md')), 'enrich task should be generated')
    assert(fs.existsSync(path.join(root, '.agent-rules/ai-enrichment-schema.json')), 'enrich schema should be generated')
    assert(fs.existsSync(path.join(root, '.claude/skills/enrich-agent-rules/SKILL.md')), 'enrich skill adapter should be generated')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('enrich continue imports candidate domains with evidence', () => {
  const root = makeTempProject('enrich-import')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'enrich-import', dependencies: { next: '^14.0.0', react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'src/app/(layout)/(basic)/order/list/page.tsx'), 'export default function OrderList() {}\n')
    write(path.join(root, 'src/app/api/orders/route.ts'), 'export async function GET() {}\n')
    write(path.join(root, 'src/server/actions/order.ts'), 'export async function queryOrder() {}\n')
    write(path.join(root, 'src/utils/http.ts'), 'export const http = {}\n')
    const generateResult = runCli(['--enrich', '--root', root])
    assert(generateResult.status === 0, `enrich should exit 0, got ${generateResult.status}\n${generateResult.outputText}`)
    writeJson(path.join(root, '.agent-rules/ai-enrichment.candidate.json'), {
      schemaVersion: 1,
      generatedAt: '2026-06-24T00:00:00.000Z',
      domains: [{
        name: 'order',
        kind: 'page',
        root: 'src/app/(layout)/(basic)/order',
        confidence: 'high',
        reason: '订单页面目录与 server action 均指向 order 业务域',
        evidenceRefs: [{ path: 'src/app/(layout)/(basic)/order/list/page.tsx' }, { path: 'src/server/actions/order.ts' }]
      }],
      impact: [{
        name: 'order',
        pages: ['src/app/(layout)/(basic)/order/list/page.tsx'],
        apis: ['src/app/api/orders/route.ts', 'src/server/actions/order.ts'],
        stores: [],
        components: [],
        confidence: 'high',
        reason: '页面入口明确属于 order 域',
        evidenceRefs: [{ path: 'src/app/(layout)/(basic)/order/list/page.tsx' }]
      }],
      sharedAssets: [{
        path: 'src/utils/http.ts',
        kind: 'api',
        usedBy: ['order', 'auth'],
        confidence: 'high',
        evidenceRefs: [{ path: 'src/utils/http.ts' }]
      }],
      apiFacts: [{
        id: 'api.currentErrorObject',
        value: {
          responseWrapper: 'src/utils/http.ts',
          hasStructuredErrorType: true
        },
        status: 'confirmed',
        confidence: 'high',
        reason: '统一请求封装返回结构化错误',
        evidenceRefs: [{ path: 'src/utils/http.ts' }]
      }],
      directories: [{
        id: 'dir.api',
        value: 'src/app/api（Next.js route handler）+ src/server/actions（server actions）',
        status: 'inferred',
        confidence: 'high',
        reason: '接口入口由 Next.js route handler 和 server actions 共同承担',
        evidenceRefs: [{ path: 'src/app/api/orders/route.ts' }, { path: 'src/server/actions/order.ts' }]
      }, {
        id: 'dir.controllers',
        value: '不采用传统 controllers 目录；路由处理由 src/app/api/**/route.* 承担',
        status: 'not-applicable',
        confidence: 'high',
        reason: '项目使用 Next.js App Router route handler，而非传统 Controller 分层',
        evidenceRefs: [{ path: 'src/app/api/orders/route.ts' }]
      }, {
        id: 'dir.services',
        value: '未发现独立 service 层；当前服务端业务调用集中在 src/server/actions',
        status: 'needs-confirmation',
        confidence: 'medium',
        reason: '新增复杂服务逻辑前需确认是继续沿用 server actions，还是引入独立 service 层',
        evidenceRefs: [{ path: 'src/server/actions/order.ts' }]
      }, {
        id: 'dir.serverActions',
        value: 'src/server/actions',
        status: 'inferred',
        confidence: 'high',
        reason: '服务端业务调用集中在 src/server/actions',
        evidenceRefs: [{ path: 'src/server/actions/order.ts' }]
      }],
      semantics: [{
        id: 'order.list',
        domain: 'order',
        statement: '订单列表页面展示订单查询结果；具体状态语义需业务确认。',
        risk: ['订单', '状态'],
        evidenceRefs: [{ path: 'src/app/(layout)/(basic)/order/list/page.tsx' }]
      }]
    })
    const result = runCli(['--enrich', '--continue', '--root', root])
    assert([0, 2].includes(result.status), `enrich continue should exit 0 or 2, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, 'AI enrichment 已导入', 'continue output')
    assertIncludes(result.outputText, 'API 事实 1 条', 'continue output should count imported API facts')
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    assertIncludes(map, 'order：`src/app/(layout)/(basic)/order`', 'domain map should import candidate domain')
    assertIncludes(map, '`src/server/actions/order.ts`', 'domain map should include APIs from impact')
    const reuse = fs.readFileSync(path.join(root, '.agent-rules/project-reuse-candidates.md'), 'utf8')
    assertIncludes(reuse, '`src/utils/http.ts`', 'reuse candidates should import shared assets')
    const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
    assertIncludes(architecture, '页面目录：src/app', 'architecture should be rerendered with imported pages directory')
    assertIncludes(architecture, 'API / service 目录：src/app/api（Next.js route handler）+ src/server/actions（server actions）', 'architecture should import descriptive API architecture values')
    assertIncludes(architecture, 'Controller / 路由处理目录：不采用传统 controllers 目录', 'architecture should explain template mismatch instead of leaving controllers undefined')
    assertIncludes(architecture, '（不适用）', 'not-applicable directory should be labeled')
    assertIncludes(architecture, 'Service / use case 目录：未发现独立 service 层', 'architecture should import needs-confirmation explanations')
    assertIncludes(architecture, '（待人工确认）', 'needs-confirmation directory should be labeled')
    assertIncludes(architecture, 'AI 识别的补充架构入口', 'architecture should render extra AI-discovered architecture dirs')
    assertIncludes(architecture, 'Server Actions 目录：src/server/actions', 'extra architecture dirs should be rendered')
    const manifest = readJson(path.join(root, '.agent-rules/project-facts.json'))
    const domain = manifest.facts.find(item => item.id === 'domain.map')
    assert(domain && domain.source === 'ai-enrichment', 'domain.map should record ai-enrichment as source')
    const pagesDir = manifest.facts.find(item => item.id === 'dir.pages')
    assert(pagesDir && pagesDir.value === 'src/app' && pagesDir.source === 'ai-enrichment', 'dir.pages should be inferred from imported App Router domains')
    const controllersDir = manifest.facts.find(item => item.id === 'dir.controllers')
    assert(controllersDir && controllersDir.status === 'not-applicable' && controllersDir.source === 'ai-enrichment', 'dir.controllers should record a not-applicable AI architecture explanation')
    const apiDir = manifest.facts.find(item => item.id === 'dir.api')
    assert(apiDir && /server actions/.test(apiDir.value), 'dir.api should accept descriptive values with multiple structural entrypoints')
    const apiFact = manifest.facts.find(item => item.id === 'api.currentErrorObject')
    assert(apiFact && apiFact.source === 'ai-enrichment' && apiFact.status === 'confirmed', 'apiFacts should be imported into project facts')
    const servicesDir = manifest.facts.find(item => item.id === 'dir.services')
    assert(servicesDir && servicesDir.status === 'needs-confirmation', 'dir.services should preserve needs-confirmation status')
    const semantics = readJson(path.join(root, '.agent-rules/project-semantics.json'))
    assert(semantics.entries.some(entry => entry.id === 'order.list' && entry.status === 'inferred'), 'AI semantic candidates should be imported as inferred')
    const verifyResult = verify(root)
    assert([0, 2].includes(verifyResult.status), `verify should not fail after ai import, got ${verifyResult.status}\n${verifyResult.outputText}`)
  } finally {
    cleanup(root)
  }
})

test('detects Spring backend API and exception handling facts', () => {
  const root = makeTempProject('spring-api')
  try {
    write(path.join(root, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion></project>\n')
    write(path.join(root, 'event-api/src/main/java/demo/api/EventClient.java'), [
      'package demo.api;',
      'import org.springframework.web.bind.annotation.RequestMapping;',
      'public interface EventClient {',
      '  @RequestMapping("/events")',
      '  APIResponse<String> list();',
      '}',
      ''
    ].join('\n'))
    write(path.join(root, 'event-domain/src/main/java/demo/controller/EventController.java'), [
      'package demo.controller;',
      'import org.springframework.web.bind.annotation.RestController;',
      '@RestController',
      'public class EventController implements demo.api.EventClient {',
      '  public demo.share.APIResponse<String> list() { return demo.share.APIResponse.success("ok"); }',
      '}',
      ''
    ].join('\n'))
    write(path.join(root, 'event-share/src/main/java/demo/share/APIResponse.java'), [
      'package demo.share;',
      'public class APIResponse<T> {',
      '  private Boolean success;',
      '  private String code="0";',
      '  private String message;',
      '  private T data;',
      '  public static <T> APIResponse<T> success(T data) { return new APIResponse<T>(); }',
      '  public static <T> APIResponse<T> fail(String code, String message, T data) { return new APIResponse<T>(); }',
      '}',
      ''
    ].join('\n'))
    write(path.join(root, 'event-share/src/main/java/demo/share/BusinessException.java'), [
      'package demo.share;',
      'public class BusinessException extends RuntimeException {',
      '  private String errorCode;',
      '}',
      ''
    ].join('\n'))
    write(path.join(root, 'event-share/src/main/java/demo/share/GlobalExceptionHandler.java'), [
      'package demo.share;',
      'import org.springframework.http.HttpStatus;',
      'import org.springframework.web.bind.annotation.ControllerAdvice;',
      'import org.springframework.web.bind.annotation.ExceptionHandler;',
      'import org.springframework.web.bind.annotation.ResponseStatus;',
      '@ControllerAdvice',
      'public class GlobalExceptionHandler {',
      '  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(GlobalExceptionHandler.class);',
      '  @ExceptionHandler(BusinessException.class)',
      '  @ResponseStatus(HttpStatus.OK)',
      '  public APIResponse<String> handle(BusinessException e) {',
      '    log.error("business", e);',
      '    return APIResponse.fail("BIZ_ERROR", "业务异常", null);',
      '  }',
      '}',
      ''
    ].join('\n'))
    write(path.join(root, 'event-domain/src/main/java/demo/security/ShiroFilter.java'), [
      'package demo.security;',
      'public class ShiroFilter extends org.apache.shiro.web.filter.authc.AuthenticatingFilter {',
      '  protected boolean onAccessDenied(javax.servlet.ServletRequest request, javax.servlet.ServletResponse response) throws Exception {',
      '    ((javax.servlet.http.HttpServletResponse) response).setHeader("Access-Control-Allow-Credentials", "true");',
      '    ((javax.servlet.http.HttpServletResponse) response).setStatus(463);',
      '    return false;',
      '  }',
      '}',
      ''
    ].join('\n'))

    generate(root)
    const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
    assertIncludes(apiRules, '请求库：Spring MVC / Spring Boot', 'Spring backend should record request/API framework')
    assertIncludes(apiRules, '成功业务码：`{"value":"0","type":"string"}`', 'Spring backend should record response success code')
    assertIncludes(apiRules, '当前显式处理的 HTTP 状态：`200`、`463`', 'Spring backend should record handled statuses')
    assertIncludes(apiRules, 'GlobalExceptionHandler.java', 'Spring backend should render global exception handler evidence')
    assert(apiRules.indexOf('统一请求入口：未定义') < 0, 'Spring backend should not leave api.entry undefined')
    const securityRules = fs.readFileSync(path.join(root, '.agent-rules/project-security-performance.md'), 'utf8')
    assertIncludes(securityRules, '认证 / 路由守卫：event-domain/src/main/java/demo/security/ShiroFilter.java', 'Spring backend should record auth guard entry')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('detects Express backend API facts without directory gap', () => {
  const root = makeTempProject('express-api')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'express-api', dependencies: { express: '^4.18.0' } }, null, 2))
    write(path.join(root, 'src/server.js'), [
      'const express = require("express")',
      'const app = express()',
      'app.get("/health", (req, res) => res.json({ ok: true }))',
      'app.use((err, req, res, next) => res.status(500).json({ message: err.message }))',
      ''
    ].join('\n'))
    const result = generate(root)
    assert(result.outputText.indexOf('目录识别缺口') < 0, 'Express server entry should satisfy backend entry detection')
    const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
    const factsSection = sectionBetween(apiRules, '## 已确认实现事实', '## 已知实现差距')
    assertIncludes(factsSection, '请求库：Express', 'Express backend should record API framework')
    assertIncludes(factsSection, '当前显式处理的 HTTP 状态：`500`', 'Express backend should record handled statuses')
    assert(factsSection.indexOf('统一请求入口：未定义') < 0, 'Express backend should not leave API entry undefined')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('detects Next.js App Router directories through scanner adapters', () => {
  const root = makeTempProject('next-app-router')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'app-router', dependencies: { next: '^14.0.0', react: '^18.0.0', axios: '^1.0.0' } }, null, 2))
    write(path.join(root, 'src/app/page.tsx'), 'export default function Page() {}\n')
    write(path.join(root, 'src/app/layout.tsx'), 'export default function Layout({ children }) { return children }\n')
    write(path.join(root, 'src/app/(auth)/login/page.tsx'), 'export default function Login() {}\n')
    write(path.join(root, 'src/app/[locale]/page.tsx'), 'export default function LocalePage() {}\n')
    write(path.join(root, 'src/app/orders/page.tsx'), 'export default function Orders() {}\n')
    write(path.join(root, 'src/app/api/orders/route.ts'), 'export async function GET() {}\n')
    write(path.join(root, 'src/lib/actions/index.ts'), 'export async function createOrder() {}\n')
    write(path.join(root, 'src/components/Foo.tsx'), 'export default function Foo() {}\n')
    const result = generate(root)
    assert(result.outputText.indexOf('目录识别缺口') < 0, 'Next App Router should not be reported as a directory gap')
    const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
    assertIncludes(architecture, '页面目录：src/app', 'architecture should record the adapter-detected pages dir')
    assertIncludes(architecture, '路由目录：src/app（Next.js App Router 文件系统路由）', 'architecture should explain App Router routing')
    assertIncludes(architecture, 'API / service 目录：src/app/api', 'architecture should record the adapter-detected api dir')
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    assertIncludes(map, '`src/app/api/orders/route.ts`', 'domain map should pick up api files once the adapter supplies the dir')
    assertIncludes(map, 'orders：`src/app/orders`', 'domain map should keep real App Router business segments')
    assert(map.indexOf('api：`src/app/api`') < 0, 'App Router api directory should not be listed as a page domain')
    assert(map.indexOf('page：`src/app/page.tsx`') < 0, 'App Router page.tsx should not be listed as a business domain')
    assert(map.indexOf('(auth)') < 0, 'App Router route groups should not be listed as business domains')
    assert(map.indexOf('[locale]') < 0, 'App Router dynamic segments should not be listed as business domains')
    assert(map.indexOf('未检测到 API 文件') < 0, 'domain map should no longer report missing API files')
    assertIncludes(architecture, 'Server Actions 目录：src/lib/actions', 'Next scanner should detect lib/actions as server actions')
    const manifest = readJson(path.join(root, '.agent-rules/project-facts.json'))
    const pagesDir = manifest.facts.find(item => item.id === 'dir.pages')
    const routerDir = manifest.facts.find(item => item.id === 'dir.router')
    assert(pagesDir && pagesDir.source === 'Next.js scanner', 'dir.pages should come from the Next.js scanner')
    assert(routerDir && routerDir.source === 'Next.js scanner', 'dir.router should come from the Next.js scanner')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('preserves adapter-detected directories across regeneration with --defaults', () => {
  const root = makeTempProject('next-app-router-persist')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'app-router', dependencies: { next: '^14.0.0', react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'src/app/page.tsx'), 'export default function Page() {}\n')
    write(path.join(root, 'src/app/api/orders/route.ts'), 'export async function GET() {}\n')
    generate(root)
    // A non-interactive regeneration must keep high-confidence adapter facts stable.
    generate(root)
    const architecture = fs.readFileSync(path.join(root, '.agent-rules/project-architecture.md'), 'utf8')
    assertIncludes(architecture, '页面目录：src/app', 'regeneration should preserve the adapter-detected pages dir')
    assertIncludes(architecture, 'API / service 目录：src/app/api', 'regeneration should preserve the adapter-detected api dir')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('surfaces a directory-detection gap when --defaults cannot find scope-critical dirs', () => {
  const root = makeTempProject('dir-gap')
  try {
    // Non-standard React frontend layout that no framework adapter recognizes.
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'custom-react', dependencies: { react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'src/screens/Home.tsx'), 'export default function Home() {}\n')
    const result = generate(root)
    assertIncludes(result.outputText, '目录识别缺口', 'generation should announce a directory gap section')
    assertIncludes(result.outputText, '未识别到页面 / 视图目录', 'generation should name the missing scope-critical dir')
    // verify must keep surfacing the gap (as a warning, not a hard error)
    const verifyResult = verify(root)
    assert(verifyResult.status === 0, `verify should still pass (warning only), got ${verifyResult.status}\n${verifyResult.outputText}`)
    assertIncludes(verifyResult.outputText, '未识别到页面 / 视图目录', 'verify should warn about the unresolved directory gap')
  } finally {
    cleanup(root)
  }
})

test('directory gap is suppressed once the user supplies or skips the directory', () => {
  const root = makeTempProject('dir-gap-resolved')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'custom-react', dependencies: { react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'src/screens/Home.tsx'), 'export default function Home() {}\n')
    // Interactive run where the user explicitly skips every fallback prompt
    // (all blank). That records a confirmed-absent decision, so no gap warning.
    const input = ['', '', '', '', '', '', '', '', '', ''].join('\n') + '\n'
    const result = runCli(['--root', root], { input })
    assert(result.status === 0, `interactive generate should exit 0, got ${result.status}\n${result.outputText}`)
    assert(result.outputText.indexOf('目录识别缺口') < 0, 'an explicitly skipped directory must not be reported as a gap')
    assert(verify(root).outputText.indexOf('未识别到页面 / 视图目录') < 0, 'verify must not nag about a user-confirmed-absent directory')
  } finally {
    cleanup(root)
  }
})

test('maps domains from feature dirs, page files, and apis/ plural directory', () => {
  const root = makeTempProject('domain-map')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0', axios: '^1.0.0' } }, null, 2))
    // pages as flat files (not subdirectories) plus framework files that must be skipped
    write(path.join(root, 'pages/_app.js'), 'export default function App() {}\n')
    write(path.join(root, 'pages/order-detail.js'), 'export default function OrderDetail() {}\n')
    write(path.join(root, 'pages/ticket.js'), 'export default function Ticket() {}\n')
    // feature dirs as real business domains
    mkdirp(path.join(root, 'features/payment'))
    mkdirp(path.join(root, 'features/refund'))
    // apis/ plural directory
    write(path.join(root, 'apis/orders.js'), 'export const getOrders = () => {}\n')
    write(path.join(root, 'apis/payment.js'), 'export const pay = () => {}\n')
    generate(root)
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    assertIncludes(map, 'payment：`features/payment`', 'domain map should list feature domains')
    assertIncludes(map, 'refund：`features/refund`', 'domain map should list feature domains')
    assertIncludes(map, 'order-detail：`pages/order-detail.js`', 'domain map should list page files, not just subdirectories')
    assertIncludes(map, '`apis/orders.js`', 'domain map should detect apis/ plural directory')
    assertIncludes(map, '`apis/payment.js`', 'domain map should detect apis/ plural directory')
    assert(map.indexOf('_app') < 0, 'framework files starting with _ should be skipped')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('aggregates impact surface from feature/page names and api imports', () => {
  const root = makeTempProject('impact')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0', axios: '^1.0.0' } }, null, 2))
    mkdirp(path.join(root, 'features/checkout'))
    write(path.join(root, 'features/checkout/index.js'), "import { pay } from '../../apis/payment'\n")
    // page that shares the feature name and imports an api by reference path
    write(path.join(root, 'pages/checkout.js'), "import { getOrders } from '@/apis/orders'\nexport default function Checkout() {}\n")
    // prefix-merged pages forming one domain
    write(path.join(root, 'pages/ticket.js'), "import { listTickets } from '../apis/tickets'\nexport default function Ticket() {}\n")
    write(path.join(root, 'pages/ticket-transfer.js'), 'export default function Transfer() {}\n')
    // page with no api import -> excluded from impact section
    write(path.join(root, 'pages/about.js'), 'export default function About() {}\n')
    write(path.join(root, 'apis/payment.js'), 'export const pay = () => {}\n')
    write(path.join(root, 'apis/orders.js'), 'export const getOrders = () => {}\n')
    write(path.join(root, 'apis/tickets.js'), 'export const listTickets = () => {}\n')
    generate(root)
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    const impact = map.slice(map.indexOf('## 域关联'))
    assertIncludes(impact, 'feature：`features/checkout`', 'impact should attach the feature dir')
    assertIncludes(impact, '`apis/payment.js`', 'impact should link feature-imported api')
    assertIncludes(impact, '`apis/orders.js`', 'impact should link page-imported api')
    // ticket and ticket-transfer must merge into one domain by prefix
    assertIncludes(impact, '`pages/ticket-transfer.js`、`pages/ticket.js`', 'prefix pages should merge into one domain')
    assert(impact.indexOf('about') < 0, 'pages without cross-source links should be excluded from impact surface')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('links stores/components into impact and derives cross-domain reuse candidates', () => {
  const root = makeTempProject('reuse')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0', axios: '^1.0.0' } }, null, 2))
    write(path.join(root, 'components/Card.js'), 'export default function Card() {}\n')
    write(path.join(root, 'components/SoloBadge.js'), 'export default function SoloBadge() {}\n')
    write(path.join(root, 'store/cart.js'), 'export const cart = {}\n')
    write(path.join(root, 'apis/payment.js'), 'export const pay = () => {}\n')
    write(path.join(root, 'apis/orders.js'), 'export const getOrders = () => {}\n')
    // two domains both importing the shared Card + cart store
    write(path.join(root, 'pages/checkout.js'), "import Card from '@/components/Card'\nimport { cart } from '@/store/cart'\nimport { pay } from '../apis/payment'\nexport default function Checkout() {}\n")
    write(path.join(root, 'pages/orders.js'), "import Card from '@/components/Card'\nimport { cart } from '@/store/cart'\nimport { getOrders } from '../apis/orders'\nexport default function Orders() {}\n")
    // SoloBadge used by a single domain -> must NOT be a reuse candidate
    write(path.join(root, 'pages/profile.js'), "import SoloBadge from '@/components/SoloBadge'\nimport { getOrders } from '../apis/orders'\nexport default function Profile() {}\n")
    generate(root)
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    const impact = map.slice(map.indexOf('## 域关联'))
    assertIncludes(impact, '状态：`store/cart.js`', 'impact should link imported store slices')
    assertIncludes(impact, '组件：`components/Card.js`', 'impact should link imported shared components')
    const reuse = fs.readFileSync(path.join(root, '.agent-rules/project-reuse-candidates.md'), 'utf8')
    assertIncludes(reuse, '`components/Card.js`（组件，被 2 个域使用', 'reuse index should list components shared across domains')
    assertIncludes(reuse, '`store/cart.js`（状态，被 2 个域使用', 'reuse index should list stores shared across domains')
    assert(reuse.indexOf('SoloBadge') < 0, 'assets used by a single domain must not be reuse candidates')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('includes component-only and store-only page domains in impact surface', () => {
  const root = makeTempProject('impact-asset-only')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'components/Hero.js'), 'export default function Hero() {}\n')
    write(path.join(root, 'store/session.js'), 'export const session = {}\n')
    // landing imports only a shared component (no API, no store) -> must still appear
    write(path.join(root, 'pages/landing.js'), "import Hero from '@/components/Hero'\nexport default function Landing() {}\n")
    // dashboard imports only a store (no API, no component) -> must still appear
    write(path.join(root, 'pages/dashboard.js'), "import { session } from '@/store/session'\nexport default function Dashboard() {}\n")
    // about imports nothing shared -> must stay excluded
    write(path.join(root, 'pages/about.js'), 'export default function About() {}\n')
    generate(root)
    const map = fs.readFileSync(path.join(root, '.agent-rules/project-domain-map.md'), 'utf8')
    const impact = map.slice(map.indexOf('## 域关联'))
    assertIncludes(impact, '- landing', 'a page linked only to a component must appear in impact')
    assertIncludes(impact, '组件：`components/Hero.js`', 'component-only domain should show its component')
    assertIncludes(impact, '- dashboard', 'a page linked only to a store must appear in impact')
    assertIncludes(impact, '状态：`store/session.js`', 'store-only domain should show its store')
    assert(impact.indexOf('- about') < 0, 'a page with no shared linkage must stay excluded')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('generates the agent-agnostic semantic workflow document', () => {
  const root = makeTempProject('semantic-workflow')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const wf = path.join(root, '.agent-rules/semantic-workflow.md')
    assert(fs.existsSync(wf), 'semantic-workflow.md should be generated')
    const text = fs.readFileSync(wf, 'utf8')
    assertIncludes(text, 'project-semantics.json', 'workflow should reference the semantic store')
    assertIncludes(text, 'evidenceRefs', 'workflow should document the entry schema')
    assertIncludes(text, 'Codex', 'workflow should be framed as agent-agnostic')
    assertIncludes(text, '会话级对账', 'workflow should host the agent-agnostic reconcile procedure')
    // index must route business-semantic tasks to the workflow doc
    assertIncludes(fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8'), 'semantic-workflow.md', 'index should route to the workflow')
    // tampering with the workflow doc must be caught as artifact drift
    fs.appendFileSync(wf, '\nmanual drift\n')
    assertVerifyFails(root, '生成产物已漂移：.agent-rules/semantic-workflow.md')
  } finally {
    cleanup(root)
  }
})

test('generates the sync-semantics skill adapter', () => {
  const root = makeTempProject('semantic-skill')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    const skill = path.join(root, '.claude/skills/sync-semantics/SKILL.md')
    assert(fs.existsSync(skill), 'sync-semantics SKILL.md should be generated')
    const text = fs.readFileSync(skill, 'utf8')
    assertIncludes(text, 'name: sync-semantics', 'skill should carry frontmatter name')
    assertIncludes(text, 'project-semantics.json', 'skill should target the semantic store')
    assertIncludes(text, '冲突', 'skill should encode the conflict-aware reconciliation loop')
    assertIncludes(text, '--verify --strict', 'skill should end with strict verification')
    fs.appendFileSync(skill, '\nmanual drift\n')
    assertVerifyFails(root, '生成产物已漂移：.claude/skills/sync-semantics/SKILL.md')
  } finally {
    cleanup(root)
  }
})

test('persists a curated semantic entry across regeneration and verifies it', () => {
  const root = makeTempProject('semantics-persist')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0', axios: '^1.0.0' } }, null, 2))
    mkdirp(path.join(root, 'features/checkout'))
    write(path.join(root, 'pages/checkout.js'), "import { pay } from '@/apis/payment'\nexport default function Checkout() {}\n")
    write(path.join(root, 'apis/payment.js'), 'export const pay = () => {}\n')
    generate(root)
    const semFile = path.join(root, '.agent-rules/project-semantics.json')
    assert(fs.existsSync(semFile), 'generation should create project-semantics.json')
    assert(readJson(semFile).entries.length === 0, 'fresh semantics store should start empty')
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'apis/payment.js'))).digest('hex')
    writeJson(semFile, {
      schemaVersion: 1,
      entries: [{
        id: 'checkout.payment-flow',
        domain: 'checkout',
        statement: '支付成功后才能创建订单',
        risk: ['金额'],
        status: 'user-confirmed',
        recordedBy: 'ai',
        evidenceRefs: [{ path: 'apis/payment.js', sha256: sha }],
        verifiedAt: '2026-06-23'
      }]
    })
    assertVerifyOk(root)
    generate(root) // regeneration must NOT clobber curated semantics
    assert(readJson(semFile).entries.length === 1, 'regeneration must preserve curated semantics')
    assert(readJson(semFile).entries[0].id === 'checkout.payment-flow', 'regeneration must preserve the entry content')
    assertVerifyOk(root)
  } finally {
    cleanup(root)
  }
})

test('semantics check passes for a healthy semantic store', () => {
  const root = makeTempProject('semantics-check-ok')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'pages/checkout.js'), 'export default function Checkout() {}\n')
    generate(root)
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [{
        id: 'checkout.copy',
        domain: 'checkout',
        statement: '结账页面展示提交入口。',
        status: 'inferred',
        verifiedAt: '2026-06-30'
      }]
    })
    const result = semanticsCheck(root)
    assert(result.status === 0, `semantics check should exit 0, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '通过：语义层结构', 'semantics check output')
  } finally {
    cleanup(root)
  }
})

test('semantics check exits 2 for semantic warnings only', () => {
  const root = makeTempProject('semantics-check-warning')
  try {
    write(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { react: '^18.0.0' } }, null, 2))
    write(path.join(root, 'pages/checkout.js'), 'export default function Checkout() {}\n')
    generate(root)
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [{
        id: 'checkout.amount',
        domain: 'checkout',
        statement: '金额规则来自当前页面观察，尚未确认。',
        risk: ['金额'],
        status: 'inferred',
        verifiedAt: '2026-06-30'
      }]
    })
    const result = semanticsCheck(root)
    assert(result.status === 2, `semantics check should exit 2 on warnings, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '高风险语义尚未人工确认：checkout.amount', 'semantics check output')
    assertIncludes(result.outputText, '检查完成：无结构错误', 'semantics check output')
  } finally {
    cleanup(root)
  }
})

test('semantics check exits 1 for malformed semantic entries', () => {
  const root = makeTempProject('semantics-check-error')
  try {
    mkdirp(path.join(root, 'pages'))
    generate(root)
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [
        { id: 'bad.status', domain: 'pages', statement: 'bad', status: 'guessed', verifiedAt: '2026-06-30' }
      ]
    })
    const result = semanticsCheck(root)
    assert(result.status === 1, `semantics check should exit 1 on errors, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '语义状态非法：bad.status', 'semantics check output')
  } finally {
    cleanup(root)
  }
})

test('verify flags invalid, duplicate, high-risk-unconfirmed and unknown-domain semantics', () => {
  const root = makeTempProject('semantics-verify')
  try {
    mkdirp(path.join(root, 'pages'))
    write(path.join(root, 'pages/checkout.js'), 'export default function C() {}\n')
    generate(root)
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [
        { id: 'a.amount', domain: 'checkout', statement: '金额含税', risk: ['金额'], status: 'inferred', verifiedAt: '2026-06-23' },
        { id: 'a.amount', domain: 'checkout', statement: 'duplicate id', status: 'inferred', verifiedAt: '2026-06-23' },
        { id: 'b.bad', domain: 'checkout', statement: 'x', status: 'guessed', verifiedAt: '2026-06-23' },
        { id: 'c.ghost', domain: 'no-such-domain', statement: 'y', status: 'user-confirmed', verifiedAt: '2026-06-23' }
      ]
    })
    const result = verify(root)
    assert(result.status === 1, `verify should exit 1 on semantic schema errors, got ${result.status}\n${result.outputText}`)
    assertIncludes(result.outputText, '语义状态非法：b.bad', 'verify output')
    assertIncludes(result.outputText, '存在重复语义 ID：a.amount', 'verify output')
    assertIncludes(result.outputText, '高风险语义尚未人工确认：a.amount', 'verify output')
    assertIncludes(result.outputText, '语义关联的域不在业务域地图中：c.ghost', 'verify output')
  } finally {
    cleanup(root)
  }
})

test('verify reports malformed semantics gracefully instead of crashing', () => {
  const root = makeTempProject('semantics-malformed')
  try {
    mkdirp(path.join(root, 'pages'))
    write(path.join(root, 'pages/checkout.js'), 'export default function C() {}\n')
    generate(root)
    writeJson(path.join(root, '.agent-rules/project-semantics.json'), {
      schemaVersion: 1,
      entries: [
        { id: 'x.a', domain: 'checkout', statement: 's', status: 'inferred', verifiedAt: '2026/6/23', evidenceRefs: { path: 'pages/checkout.js' } },
        { id: 'x.b', domain: 'checkout', statement: 's', status: 'inferred', verifiedAt: '2026-06-23', evidenceRefs: [{ sha256: 123 }], risk: [5] }
      ]
    })
    const result = verify(root)
    assert(result.status === 1, `verify should exit 1 on malformed semantics, got ${result.status}\n${result.outputText}`)
    assert(!/TypeError|at Object\.|\bat \w+ \(/.test(result.outputText), `verify must not leak a stack trace.\n${result.outputText}`)
    assertIncludes(result.outputText, 'verifiedAt 必须是 YYYY-MM-DD', 'verify output')
    assertIncludes(result.outputText, 'evidenceRefs 必须是数组', 'verify output')
    assertIncludes(result.outputText, 'risk 数组元素必须是字符串', 'verify output')
    assertIncludes(result.outputText, 'evidenceRefs 条目必须包含字符串 path', 'verify output')
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
    const apiRules = fs.readFileSync(path.join(root, '.agent-rules/project-api-error-handling.md'), 'utf8')
    const factsSection = sectionBetween(apiRules, '## 已确认实现事实', '## 已知实现差距')
    assert(factsSection.indexOf('统一请求入口：未定义') < 0, 'backend should derive an API entry from handlers/backend dirs')
    assert(factsSection.indexOf('请求库：未定义') < 0, 'backend should derive a backend API library')
    assert(factsSection.indexOf('withCredentials：未定义') < 0, 'backend should mark browser withCredentials as not-applicable')
    const stateRules = fs.readFileSync(path.join(root, '.agent-rules/project-state-data-flow.md'), 'utf8')
    assert(stateRules.indexOf('状态管理：未定义') < 0, 'backend should mark frontend state library as not-applicable')
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
