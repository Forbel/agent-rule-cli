#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
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
    // index must route business-semantic tasks to the workflow doc
    assertIncludes(fs.readFileSync(path.join(root, '.agent-rules/project-index.md'), 'utf8'), 'semantic-workflow.md', 'index should route to the workflow')
    // tampering with the workflow doc must be caught as artifact drift
    fs.appendFileSync(wf, '\nmanual drift\n')
    assertVerifyFails(root, '生成产物已漂移：.agent-rules/semantic-workflow.md')
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
