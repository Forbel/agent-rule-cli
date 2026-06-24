const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const { execFileSync } = require('child_process')

const SCRIPT_DIR = path.resolve(__dirname, '..')
const PACKAGE = require('../package.json')
const COMMAND = 'npx agent-rule-cli'
const SHARED_TEMPLATE_DIR = path.join(SCRIPT_DIR, 'agent-rules-templates', 'shared')
const args = process.argv.slice(2)
const rootArgIndex = args.indexOf('--root')
if (rootArgIndex >= 0 && (!args[rootArgIndex + 1] || args[rootArgIndex + 1].startsWith('-'))) {
  process.stderr.write('错误：--root 后需要提供项目目录。\n')
  process.exit(1)
}
const ROOT = path.resolve(rootArgIndex >= 0 ? args[rootArgIndex + 1] : process.cwd())
const RULE_DIR = path.join(ROOT, '.agent-rules')
const VERIFY_ONLY = args.includes('--verify')
const ENRICH = args.includes('--enrich')
const ENRICH_CONTINUE = ENRICH && args.includes('--continue')
const STRICT = args.includes('--strict') || ENRICH_CONTINUE
const NON_INTERACTIVE = args.includes('--defaults') || ENRICH
const SHOW_HELP = args.includes('--help') || args.includes('-h')
const NOW = new Date()
const VERIFIED_AT = NOW.toISOString().slice(0, 10)
const TIMESTAMP = NOW.toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const EXISTING_MANIFEST = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RULE_DIR, 'project-facts.json'), 'utf8'))
  } catch {
    return null
  }
})()

const {
  MODULES,
  PROJECT_SCOPES,
  COMMON_SHARED_TEMPLATES,
  FRONTEND_SHARED_TEMPLATES,
  BACKEND_SHARED_TEMPLATES,
  SCOPE_CRITICAL_DIRS,
  COVERAGE_CATALOG,
  BUSINESS_CONTRACT_FACTS
} = require('./constants.cjs')

const facts = []
const answers = {}
const moduleChoices = {}
const ui = { rl: null }

const GENERATED_ARTIFACTS = [
  'AGENTS.md',
  '.agent-rules/project-index.md',
  '.agent-rules/project-summary.md',
  '.agent-rules/project-architecture.md',
  '.agent-rules/project-code-quality.md',
  '.agent-rules/project-code-inventory.md',
  '.agent-rules/project-reuse-candidates.md',
  '.agent-rules/project-ui-rules.md',
  '.agent-rules/project-api-error-handling.md',
  '.agent-rules/project-backend-api-contracts.md',
  '.agent-rules/project-backend-data-persistence.md',
  '.agent-rules/project-backend-auth-security.md',
  '.agent-rules/project-backend-jobs-messaging.md',
  '.agent-rules/project-backend-observability.md',
  '.agent-rules/project-state-data-flow.md',
  '.agent-rules/project-security-performance.md',
  '.agent-rules/project-testing-quality-gates.md',
  '.agent-rules/project-git-delivery.md',
  '.agent-rules/project-business-rules.md',
  '.agent-rules/project-domain-map.md',
  '.agent-rules/semantic-workflow.md',
  '.agent-rules/ai-enrichment-task.md',
  '.agent-rules/ai-enrichment-schema.json',
  '.claude/skills/sync-semantics/SKILL.md',
  '.claude/skills/enrich-agent-rules/SKILL.md'
]

// Curated, persistent semantic store. Like project-custom.md it is never
// overwritten or hash-guarded — AI/maintainers fill it incrementally while
// fixing bugs, changing requirements or adding modules. Verified for schema,
// provenance and source drift, not for content stability.
const SEMANTICS_FILE = '.agent-rules/project-semantics.json'
const SEMANTIC_SKILL_FILE = '.claude/skills/sync-semantics/SKILL.md'
const ENRICH_TASK_FILE = '.agent-rules/ai-enrichment-task.md'
const ENRICH_SCHEMA_FILE = '.agent-rules/ai-enrichment-schema.json'
const ENRICH_CANDIDATE_FILE = '.agent-rules/ai-enrichment.candidate.json'
const ENRICH_SKILL_FILE = '.claude/skills/enrich-agent-rules/SKILL.md'
const SEMANTIC_STATUSES = new Set(['inferred', 'user-confirmed'])
const HIGH_RISK_SEMANTICS = ['金额', '权限', '状态', '审核', '支付', '订单', '退款', '删除', '禁用', '库存', '结算', '余额', '优惠']

function note(message) {
  process.stdout.write(`\n\u001b[1;36m${message}\u001b[0m\n`)
}

function warn(message) {
  process.stdout.write(`\u001b[1;33m${message}\u001b[0m\n`)
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative))
}

function read(relative) {
  try {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8')
  } catch {
    return ''
  }
}

function readJson(relative) {
  try {
    return JSON.parse(read(relative))
  } catch {
    return null
  }
}

function run(command, commandArgs = []) {
  try {
    return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function evidencePath(value) {
  if (typeof value !== 'string') return ''
  const candidates = [value, value.split('#')[0]]
  const colonPositions = [...value.matchAll(/:/g)].map(match => match.index)
  for (const position of colonPositions) candidates.push(value.slice(0, position))
  return candidates.find(candidate => candidate && exists(candidate)) || ''
}

function fingerprint(relative, mode = 'content') {
  const full = path.join(ROOT, relative)
  if (!fs.existsSync(full)) return null
  const stat = fs.statSync(full)
  if (mode === 'existence') return { path: relative, kind: stat.isDirectory() ? 'directory-exists' : 'file-exists' }
  if (stat.isFile()) return { path: relative, kind: 'file', sha256: hashFile(full) }
  if (stat.isDirectory()) {
    const listing = listFiles(relative, 4).sort().join('\n')
    return { path: relative, kind: 'directory', sha256: crypto.createHash('sha256').update(listing).digest('hex') }
  }
  return null
}

function addFact(id, module, value, status, source, evidence, noteText = '') {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return
  const existing = facts.find(item => item.id === id)
  const fact = { id, module, value, status, source, evidence, verifiedAt: VERIFIED_AT }
  const evidenceValues = Array.isArray(evidence) ? evidence : [evidence]
  const evidenceMode = id.startsWith('dir.') || ['domain.map', 'testing.files'].includes(id) ? 'existence' : 'content'
  const evidenceRefs = evidenceValues.map(evidencePath).filter(Boolean).map(relative => fingerprint(relative, evidenceMode)).filter(Boolean)
  if (evidenceRefs.length) fact.evidenceRefs = evidenceRefs
  if (noteText) fact.note = noteText
  if (existing) Object.assign(existing, fact)
  else facts.push(fact)
}

function fact(id) {
  return facts.find(item => item.id === id)
}

function factValue(id, fallback = '') {
  const item = fact(id)
  return item && item.value !== undefined && item.value !== null ? item.value : fallback
}

function previousValue(id, fallback = '') {
  const answer = EXISTING_MANIFEST && EXISTING_MANIFEST.answers && EXISTING_MANIFEST.answers[id]
  if (answer && ['user-confirmed', 'not-applicable'].includes(answer.status)) return answer.value
  const previousFact = EXISTING_MANIFEST && EXISTING_MANIFEST.facts && EXISTING_MANIFEST.facts.find(item => item.id === id && ['user-confirmed', 'not-applicable'].includes(item.status))
  return previousFact && previousFact.value !== undefined && previousFact.value !== null ? previousFact.value : fallback
}

function markdownValue(value) {
  if (Array.isArray(value)) return value.length ? value.map(item => `\`${typeof item === 'object' ? JSON.stringify(item) : item}\``).join('、') : '未定义'
  if (value === true) return '是'
  if (value === false) return '否'
  if (value && typeof value === 'object') return `\`${JSON.stringify(value)}\``
  return String(value || '未定义')
}

function listFiles(directory, maxDepth = 3) {
  const base = path.join(ROOT, directory)
  if (!fs.existsSync(base)) return []
  const output = []
  const walk = (current, depth) => {
    if (depth > maxDepth) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'coverage', '.cache', '__pycache__', '.pytest_cache'].includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else output.push(path.relative(ROOT, full))
      if (output.length >= 500) return
    }
  }
  walk(base, 0)
  return output
}

function firstExisting(candidates, type = 'any') {
  return candidates.find(candidate => {
    const full = path.join(ROOT, candidate)
    if (!fs.existsSync(full)) return false
    if (type === 'file') return fs.statSync(full).isFile()
    if (type === 'dir') return fs.statSync(full).isDirectory()
    return true
  }) || ''
}

function packageDependencies(pkg) {
  return { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}), ...((pkg && pkg.peerDependencies) || {}) }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

module.exports = {
  PACKAGE, COMMAND, SHARED_TEMPLATE_DIR, ROOT, RULE_DIR, VERIFY_ONLY, STRICT,
  NON_INTERACTIVE, SHOW_HELP, ENRICH, ENRICH_CONTINUE, NOW, VERIFIED_AT, TIMESTAMP, EXISTING_MANIFEST,
  GENERATED_ARTIFACTS, SEMANTICS_FILE, SEMANTIC_SKILL_FILE, ENRICH_TASK_FILE,
  ENRICH_SCHEMA_FILE, ENRICH_CANDIDATE_FILE, ENRICH_SKILL_FILE,
  SEMANTIC_STATUSES, HIGH_RISK_SEMANTICS,
  MODULES, PROJECT_SCOPES, COMMON_SHARED_TEMPLATES, FRONTEND_SHARED_TEMPLATES,
  BACKEND_SHARED_TEMPLATES, SCOPE_CRITICAL_DIRS, COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS,
  facts, answers, moduleChoices, ui,
  note, warn, exists, read, readJson, run, evidencePath, fingerprint, addFact,
  fact, factValue, previousValue, markdownValue, listFiles, firstExisting,
  packageDependencies, hashFile
}
