#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const { execFileSync } = require('child_process')

const SCRIPT_DIR = __dirname
const PACKAGE = require('./package.json')
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
const STRICT = args.includes('--strict')
const NON_INTERACTIVE = args.includes('--defaults')
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

const MODULES = {
  architecture: '架构与目录',
  codeQuality: '代码质量与复用',
  ui: 'UI',
  api: 'API 与错误处理',
  state: '状态与数据流',
  security: '安全与性能',
  testingGit: '测试与 Git 交付',
  business: '业务规则'
}

const PROJECT_SCOPES = {
  frontend: '前端项目',
  backend: '后端项目',
  fullstack: '全栈项目'
}

const COMMON_SHARED_TEMPLATES = [
  'shared-api-error-handling.md',
  'shared-code-quality.md',
  'shared-git-delivery.md',
  'shared-project-requirements-check.md',
  'shared-security-performance.md',
  'shared-state-data-flow.md',
  'shared-testing-quality-gates.md'
]

const FRONTEND_SHARED_TEMPLATES = [
  'shared-ui-rules.md'
]

const BACKEND_SHARED_TEMPLATES = [
  'shared-backend-api-contracts.md',
  'shared-backend-auth-security.md',
  'shared-backend-data-persistence.md',
  'shared-backend-jobs-messaging.md',
  'shared-backend-observability.md'
]

const COVERAGE_CATALOG = {
  architecture: [
    ['architecture.identity', '项目身份、业务描述、类型、侧重和技术栈', ['project.name', 'project.description', 'project.kind', 'project.scope', 'stack.technologies']],
    ['architecture.directories', '页面、共享、API、状态和资源目录边界', ['policy.directoryBoundaries']],
    ['architecture.newDirectories', '新增目录与模块边界', ['policy.newDirectories', 'policy.featureBoundary']],
    ['architecture.language', '默认输出和文档语言', ['project.outputLanguage']]
  ],
  codeQuality: [
    ['code.dataContract', '数据契约、新模块和存量治理策略', ['policy.dataContract', 'policy.legacyGovernance']],
    ['code.modelPlacement', '类型、模型、mapper、normalizer、adapter 位置', ['policy.modelPlacement']],
    ['code.indexMaintenance', '代码资产、复用候选和业务域地图维护', ['policy.indexMaintenance']],
    ['code.encapsulation', '页面私有、领域共享和项目共享边界', ['policy.encapsulationBoundary']],
    ['code.crossProject', '跨项目包和共享库策略', ['policy.crossProjectPackages']],
    ['code.documentation', '注释、临时方案和复杂业务规则文档化', ['policy.documentation']]
  ],
  ui: [
    ['ui.stack', '组件库、主题、样式和输入来源', ['ui.library', 'policy.uiDesignSource']],
    ['ui.components', '组件目录、资产清单和共享准入', ['dir.components', 'policy.uiComponentBoundary']],
    ['ui.layoutFeedback', '布局、浮层、加载和交互反馈', ['policy.uiLayoutFeedback']],
    ['ui.forms', '表单、破坏性操作和失败保留', ['policy.uiFormBehavior']],
    ['ui.presentation', '文案、响应式、可访问性、视觉变量、图标和验收', ['policy.uiPresentation', 'policy.uiVerification']]
  ],
  api: [
    ['api.entryConfig', '统一请求入口、API 目录和基础请求配置', ['api.entry', 'api.library']],
    ['api.errorModel', '错误对象、错误分类和状态码类型', ['policy.errorClassification']],
    ['api.displayCatch', '默认展示和 catch 职责', ['policy.errorDisplay']],
    ['api.silentCustom', '静默请求、自定义错误和后置回调', ['policy.silentRequest']],
    ['api.auth', '认证失效、权限不足、清理和并发保护', ['policy.authSemantics', 'policy.authCleanup', 'policy.concurrentAuthFailure']],
    ['api.lifecycle', '重试、轮询、取消、过期响应和防重复提交', ['policy.requestLifecycle']],
    ['api.logging', '错误日志、可观测性和脱敏', ['policy.apiObservability']]
  ],
  state: [
    ['state.solution', '状态管理方案和作用域边界', ['state.library', 'policy.globalStateBoundary']],
    ['state.authority', '唯一事实源和服务端权威数据', ['policy.serverAuthority']],
    ['state.transform', '接口转换、派生数据和枚举标准化', ['policy.stateTransformation']],
    ['state.persistence', '持久化、版本、失效、清理和账号隔离', ['policy.persistence']],
    ['state.transfer', '跨页面传递和 URL 参数边界', ['policy.crossPageData']],
    ['state.asyncUi', '异步一致性和数据阶段', ['policy.asyncState']]
  ],
  security: [
    ['security.credentials', '凭证、会话、清理和敏感字段', ['policy.sensitiveFields', 'policy.credentialLifecycle']],
    ['security.exposure', 'URL、日志、错误、埋点、截图和提交记录限制', ['policy.dataExposure']],
    ['security.permissions', '权限入口和前后端权限边界', ['auth.guardEntry', 'policy.permissionBoundary']],
    ['security.paths', '部署路径、资源前缀、外链、下载和回调校验', ['policy.pathAndExternalUrl']],
    ['security.dynamicContent', '上传、富文本、Markdown、动态 HTML 和预览', ['policy.dynamicContent']],
    ['security.performance', '关键路径、性能预算、列表和大资源', ['policy.performancePaths', 'policy.performanceBudget']],
    ['security.cacheConcurrency', '并发、轮询、高频事件、缓存和降级', ['policy.cacheAndConcurrency']]
  ],
  testingGit: [
    ['git.repository', 'Git 仓库状态', ['git.repository']],
    ['git.protected', '受保护分支和禁止直接提交范围', ['git.protectedBranches']],
    ['git.branches', '需求、修复、重构和实验分支命名', ['policy.branchNaming']],
    ['git.commits', '提交格式、语言、WIP 和整理', ['policy.commitStyle', 'policy.wipCommits']],
    ['git.delivery', 'PR、CI、发布、tag 和推送边界', ['policy.releaseBoundary']],
    ['git.safety', '禁止提交文件和高风险 Git 授权', ['policy.gitSafety']],
    ['testing.strategy', '单元、集成、E2E、lint、类型和构建策略', ['testing.commands', 'policy.testStrategy']],
    ['testing.risk', '风险分级和最小验证范围', ['policy.highRiskGate']],
    ['testing.flows', '核心业务链路和必须更新测试的场景', ['policy.coreFlows']],
    ['testing.manual', '手动回归、UI/API/任务验证和环境不可用处理', ['policy.manualRegression']],
    ['testing.boundaries', '关键数据、边界场景和剩余风险记录', ['policy.testBoundaries']]
  ],
  business: [
    ['business.source', '权威业务规则来源', ['policy.businessRuleSource']],
    ['business.domains', '业务域入口和代码地图', ['domain.map']],
    ['business.risk', '高风险业务域和流程', ['policy.highRiskDomains']],
    ['business.enums', '状态、枚举、权限码和状态码来源', ['policy.businessEnums']]
  ]
}

const BUSINESS_CONTRACT_FACTS = {
  api: ['policy.authSemantics'],
  state: ['policy.serverAuthority'],
  security: ['policy.permissionBoundary'],
  testingGit: ['policy.coreFlows'],
  business: ['policy.businessRuleSource', 'policy.highRiskDomains', 'policy.businessEnums']
}

const facts = []
const answers = {}
const moduleChoices = {}
let rl

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
  '.agent-rules/project-domain-map.md'
]

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

function scanProjectIdentity() {
  const pkg = readJson('package.json')
  let name = (pkg && pkg.name) || ''
  let evidence = pkg && pkg.name ? 'package.json#name' : ''

  if (!name && exists('pyproject.toml')) {
    const match = read('pyproject.toml').match(/^name\s*=\s*["']([^"']+)/m)
    name = match ? match[1] : ''
    evidence = name ? 'pyproject.toml#name' : ''
  }
  if (!name && exists('Cargo.toml')) {
    const match = read('Cargo.toml').match(/^name\s*=\s*["']([^"']+)/m)
    name = match ? match[1] : ''
    evidence = name ? 'Cargo.toml#package.name' : ''
  }
  if (!name && exists('go.mod')) {
    const match = read('go.mod').match(/^module\s+([^\s]+)/m)
    name = match ? match[1].split('/').pop() : ''
    evidence = name ? 'go.mod#module' : ''
  }
  if (!name) {
    name = path.basename(ROOT)
    evidence = 'project directory name'
  }

  addFact('project.name', 'architecture', name, evidence === 'project directory name' ? 'inferred' : 'confirmed', 'repository', evidence)
}

function scanTechnology() {
  const technologies = []
  const evidence = []
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const depMap = {
    react: 'React', vue: 'Vue', angular: 'Angular', '@angular/core': 'Angular', next: 'Next.js', nuxt: 'Nuxt',
    axios: 'Axios', redux: 'Redux', '@reduxjs/toolkit': 'Redux Toolkit', zustand: 'Zustand', vuex: 'Vuex', pinia: 'Pinia',
    'element-ui': 'Element UI', 'element-plus': 'Element Plus', antd: 'Ant Design', '@mui/material': 'MUI',
    vite: 'Vite', webpack: 'Webpack', typescript: 'TypeScript', sass: 'Sass', 'node-sass': 'node-sass'
  }
  for (const [dep, label] of Object.entries(depMap)) {
    if (deps[dep]) {
      technologies.push(label)
      evidence.push(`package.json:${dep}`)
    }
  }
  const fileTech = [
    ['pyproject.toml', 'Python'], ['requirements.txt', 'Python'], ['Pipfile', 'Python'], ['go.mod', 'Go'],
    ['Cargo.toml', 'Rust'], ['pom.xml', 'Java/Maven'], ['build.gradle', 'Java/Gradle'], ['composer.json', 'PHP/Composer'],
    ['Gemfile', 'Ruby'], ['mix.exs', 'Elixir'], ['Package.swift', 'Swift']
  ]
  for (const [file, label] of fileTech) {
    if (exists(file) && !technologies.includes(label)) {
      technologies.push(label)
      evidence.push(file)
    }
  }
  const csproj = fs.readdirSync(ROOT).find(file => file.endsWith('.csproj'))
  if (csproj) {
    technologies.push('.NET')
    evidence.push(csproj)
  }
  addFact('stack.technologies', 'architecture', technologies, technologies.length ? 'confirmed' : 'undefined', 'dependency/config scan', evidence)
}

function inferProjectScope() {
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const frontendDeps = ['react', 'vue', 'angular', '@angular/core', 'next', 'nuxt', 'svelte', 'vite', 'webpack', '@vitejs/plugin-react', '@vitejs/plugin-vue']
  const backendDeps = ['express', 'koa', 'fastify', 'nestjs', '@nestjs/core', 'hapi', '@hapi/hapi', 'apollo-server', 'graphql-yoga', 'prisma', 'typeorm', 'sequelize', 'mongoose']
  const hasFrontend = frontendDeps.some(dep => deps[dep]) || ['src/views', 'src/pages', 'pages', 'app/pages', 'src/components', 'components'].some(exists)
  const hasBackend = backendDeps.some(dep => deps[dep]) || ['server', 'src/server', 'src/controllers', 'src/routes', 'src/main/java', 'cmd', 'internal', 'pkg', 'migrations'].some(exists) || ['pyproject.toml', 'requirements.txt', 'Pipfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile', 'mix.exs'].some(exists)
  if (hasFrontend && hasBackend) return 'fullstack'
  if (hasBackend) return 'backend'
  return 'frontend'
}

function scanDirectories() {
  const definitions = {
    'dir.pages': ['src/views', 'src/pages', 'pages', 'lib/screens'],
    'dir.router': ['src/router', 'router', 'routes', 'config/routes'],
    'dir.components': ['src/components', 'components', 'shared/components', 'app/components'],
    'dir.utils': ['src/utils', 'utils', 'lib', 'app/lib', 'src/lib'],
    'dir.api': ['src/api', 'api', 'src/services', 'services', 'app/services'],
    'dir.state': ['src/store', 'store', 'src/stores', 'stores', 'state'],
    'dir.assets': ['src/assets', 'assets', 'public', 'static'],
    'dir.backendEntry': ['server', 'src/server', 'cmd', 'app', 'src/main'],
    'dir.controllers': ['src/controllers', 'controllers', 'src/routes', 'routes', 'internal/handler', 'internal/handlers', 'handlers'],
    'dir.services': ['src/services', 'services', 'internal/service', 'internal/services', 'app/services'],
    'dir.repositories': ['src/repositories', 'repositories', 'internal/repository', 'internal/repositories', 'src/dao', 'dao'],
    'dir.models': ['src/models', 'models', 'internal/model', 'internal/models', 'domain', 'src/domain'],
    'dir.migrations': ['migrations', 'db/migrations', 'database/migrations', 'prisma/migrations'],
    'dir.jobs': ['jobs', 'src/jobs', 'workers', 'src/workers', 'tasks', 'src/tasks', 'cron'],
    'dir.config': ['config', 'configs', 'src/config', 'internal/config'],
    'dir.tests': ['tests', 'test', '__tests__', 'spec', 'src/__tests__']
  }
  for (const [id, candidates] of Object.entries(definitions)) {
    const value = firstExisting(candidates, 'dir')
    if (value) addFact(id, id === 'dir.tests' ? 'testingGit' : 'architecture', value, 'confirmed', 'filesystem', value)
  }
}

function getGitSnapshot() {
  if (!exists('.git')) return null
  const current = run('git', ['branch', '--show-current'])
  const branches = run('git', ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean)
  const remoteHead = run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
  const defaultCandidate = remoteHead || (branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : '')
  const branchCandidates = [...new Set([remoteHead, branches.includes('main') ? 'main' : '', branches.includes('master') ? 'master' : '', current].filter(Boolean))]
  return { current, branches, remoteHead, defaultCandidate, branchCandidates }
}

function scanGit() {
  const snapshot = getGitSnapshot()
  if (!snapshot) {
    addFact('git.repository', 'testingGit', false, 'confirmed', 'filesystem', 'no .git directory')
    return
  }
  const { current, branches, remoteHead, defaultCandidate, branchCandidates } = snapshot
  addFact('git.repository', 'testingGit', true, 'confirmed', 'git', '.git')
  addFact('git.currentBranch', 'testingGit', current, 'confirmed', 'git', 'git branch --show-current')
  addFact('git.branches', 'testingGit', branches, 'confirmed', 'git', 'git branch --format=%(refname:short)')
  addFact('git.branchCandidates', 'testingGit', branchCandidates, 'confirmed', 'git', 'remote HEAD, conventional branches and current branch')
  if (remoteHead) addFact('git.remoteHead', 'testingGit', remoteHead, 'confirmed', 'git', 'refs/remotes/origin/HEAD')
  if (defaultCandidate) addFact('git.defaultBranchCandidate', 'testingGit', defaultCandidate, remoteHead ? 'confirmed' : 'inferred', 'git', remoteHead ? 'refs/remotes/origin/HEAD' : 'local branch convention')
}

function collectTestFiles(testDir) {
  return testDir ? listFiles(testDir, 4).filter(file => /(?:spec|test)\.[^.]+$|_test\.[^.]+$/.test(file)).slice(0, 50) : []
}

function scanCommandsAndTests() {
  const commands = []
  const pkg = readJson('package.json')
  if (pkg && pkg.scripts) {
    const scriptEffects = (name, seen = new Set()) => {
      if (seen.has(name)) return { writesSource: false, writesArtifacts: false, writesCache: false, longRunning: false }
      seen.add(name)
      const command = pkg.scripts[name] || ''
      const category = /lint|format/.test(name) ? 'lint' : /test|spec/.test(name) ? 'test' : /build|compile/.test(name) ? 'build' : /dev|serve|start|preview|watch/.test(name) ? 'dev' : 'other'
      const effects = {
        writesSource: /--fix\b|--write\b|prettier\s+--write|ruff\s+.*--fix|\bsvgo\b/.test(command),
        writesArtifacts: category === 'build' || /\b(?:webpack|vite|rollup|tsc|build)\b/.test(command),
        writesCache: /--clearCache\b|\bclear-cache\b/.test(command),
        longRunning: category === 'dev' || /--watch\b|\bserve\b/.test(command)
      }
      const dependencies = [...command.matchAll(/npm\s+run\s+([\w:.-]+)/g)].map(match => match[1])
      for (const dependency of dependencies) {
        const nested = scriptEffects(dependency, new Set(seen))
        for (const key of Object.keys(effects)) effects[key] = effects[key] || nested[key]
      }
      return effects
    }
    for (const [name, command] of Object.entries(pkg.scripts)) {
      const category = /lint|format/.test(name) ? 'lint' : /test|spec/.test(name) ? 'test' : /build|compile/.test(name) ? 'build' : /dev|serve|start/.test(name) ? 'dev' : 'other'
      const effects = scriptEffects(name)
      commands.push({ name: `npm run ${name}`, raw: command, category, ...effects, safeForAutomaticExecution: !effects.writesSource && !effects.longRunning })
    }
  }
  const pythonConfig = `${read('pyproject.toml')}\n${read('requirements.txt')}\n${read('Pipfile')}`
  if (/\bpytest\b|\[tool\.pytest/.test(pythonConfig)) commands.push({ name: 'pytest', category: 'test', writesSource: false, writesArtifacts: false, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: 'Python test configuration' })
  if (/\bruff\b|\[tool\.ruff/.test(pythonConfig)) commands.push({ name: 'ruff check .', category: 'lint', writesSource: false, writesArtifacts: false, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: 'Python lint configuration' })
  const ecosystemCommands = [
    ['Cargo.toml', [{ name: 'cargo test', category: 'test' }, { name: 'cargo clippy', category: 'lint' }]],
    ['go.mod', [{ name: 'go test ./...', category: 'test' }, { name: 'go vet ./...', category: 'lint' }]],
    ['pom.xml', [{ name: 'mvn test', category: 'test' }]],
    ['build.gradle', [{ name: './gradlew test', category: 'test' }]],
    ['composer.json', [{ name: 'composer test', category: 'test' }]]
  ]
  for (const [file, candidates] of ecosystemCommands) {
    if (exists(file)) commands.push(...candidates.map(command => ({ ...command, writesSource: false, writesArtifacts: true, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: file })))
  }
  const testDir = factValue('dir.tests')
  const testFiles = collectTestFiles(testDir)
  const commandEvidence = [pkg && pkg.scripts ? 'package.json#scripts' : '', ...ecosystemCommands.filter(([file]) => exists(file)).map(([file]) => file), /\bpytest\b/.test(pythonConfig) ? 'Python pytest configuration' : '', /\bruff\b/.test(pythonConfig) ? 'Python ruff configuration' : ''].filter(Boolean)
  addFact('testing.commands', 'testingGit', commands, commands.length ? 'confirmed' : 'undefined', 'configuration scan', commandEvidence)
  addFact('testing.files', 'testingGit', testFiles, testFiles.length ? 'confirmed' : 'undefined', 'filesystem', testDir || 'known test directories')
}

function scanFrontendAndState() {
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const ui = [['element-ui', 'Element UI'], ['element-plus', 'Element Plus'], ['antd', 'Ant Design'], ['@mui/material', 'MUI'], ['@chakra-ui/react', 'Chakra UI'], ['vuetify', 'Vuetify']].find(([dep]) => deps[dep])
  if (ui) addFact('ui.library', 'ui', ui[1], 'confirmed', 'dependency scan', `package.json:${ui[0]}`)
  const state = [['vuex', 'Vuex'], ['pinia', 'Pinia'], ['@reduxjs/toolkit', 'Redux Toolkit'], ['redux', 'Redux'], ['zustand', 'Zustand'], ['mobx', 'MobX']].find(([dep]) => deps[dep])
  if (state) addFact('state.library', 'state', state[1], 'confirmed', 'dependency scan', `package.json:${state[0]}`)
  if (factValue('dir.state')) addFact('state.directory', 'state', factValue('dir.state'), 'confirmed', 'filesystem', factValue('dir.state'))
}

function scanApiAndAuth() {
  const candidates = [
    'src/utils/request.js', 'src/utils/request.ts', 'src/utils/http.js', 'src/utils/http.ts', 'src/lib/http.ts',
    'src/api/client.ts', 'src/api/request.ts', 'app/services/http.ts', 'lib/api_client.dart'
  ]
  const entry = firstExisting(candidates, 'file')
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const library = deps.axios ? 'Axios' : deps.ky ? 'ky' : deps['node-fetch'] ? 'node-fetch' : entry ? '项目自定义请求封装' : ''
  if (entry) addFact('api.entry', 'api', entry, 'confirmed', 'filesystem', entry)
  if (library) addFact('api.library', 'api', library, 'confirmed', 'dependency/source scan', entry || 'package.json')
  if (!entry) return

  const source = read(entry)
  const timeoutMatch = source.match(/timeout\s*:\s*(\d+)/)
  const withCredentialsMatch = source.match(/withCredentials\s*:\s*(true|false)/)
  const successCodeMatch = source.match(/\.code\s*={2,3}\s*['"]([^'"]+)['"]/) 
  const timeout = timeoutMatch && timeoutMatch[1]
  const withCredentials = withCredentialsMatch && withCredentialsMatch[1]
  const successCode = successCodeMatch && successCodeMatch[1]
  const statusCodes = [...source.matchAll(/status\s*={2,3}\s*(\d{3})/g)].map(match => Number(match[1]))
  const headerNames = [...source.matchAll(/headers\[['"]([^'"]+)['"]\]/g)].map(match => match[1])
  if (timeout) addFact('api.timeoutMs', 'api', Number(timeout), 'confirmed', 'source scan', `${entry}:timeout`)
  if (withCredentials) addFact('api.withCredentials', 'api', withCredentials === 'true', 'confirmed', 'source scan', `${entry}:withCredentials`)
  if (successCode) addFact('api.successBusinessCode', 'api', { value: successCode, type: 'string' }, 'confirmed', 'source scan', `${entry}:response interceptor`)
  if (statusCodes.length) addFact('api.handledHttpStatuses', 'api', [...new Set(statusCodes)], 'confirmed', 'source scan', `${entry}:response interceptor`)
  if (headerNames.length) addFact('api.headers', 'api', [...new Set(headerNames)], 'confirmed', 'source scan', `${entry}:request interceptor`)
  const messageCalls = (source.match(/\bMessage\s*\(|\bMessage\.(?:error|warning|success)\s*\(/g) || []).length
  const currentLogging = {
    consoleCalls: (source.match(/console\.(?:log|error|warn|debug)\s*\(/g) || []).length,
    logsRawResponse: /console\.(?:log|error|warn|debug)[\s\S]{0,160}\b(?:res|response)\b/.test(source),
    logsRawError: /console\.(?:log|error|warn|debug)[\s\S]{0,160}\berror\b/.test(source)
  }
  const currentErrorObject = {
    usesNativeError: /new\s+Error\s*\(/.test(source),
    rejectsRawError: /Promise\.reject\s*\(\s*error\s*\)/.test(source),
    hasStructuredErrorType: /class\s+\w*Error\b|new\s+(?:ApiError|HttpError|AppError)\b/.test(source)
  }
  const currentErrorPresentation = {
    globalMessageCalls: messageCalls,
    hasDuplicateSuppression: /isShowingError|messageShown|dedupe|singleFlight|authFailureHandled/.test(source)
  }
  addFact('api.currentLogging', 'api', currentLogging, 'confirmed', 'source scan', `${entry}:logging`)
  addFact('api.currentErrorObject', 'api', currentErrorObject, 'confirmed', 'source scan', `${entry}:error rejection`)
  addFact('api.currentErrorPresentation', 'api', currentErrorPresentation, 'confirmed', 'source scan', `${entry}:error presentation`)
  const implementationGaps = []
  if (currentLogging.logsRawResponse || currentLogging.logsRawError) implementationGaps.push('日志可能输出完整响应或原始错误，需核对脱敏目标')
  if (!currentErrorObject.hasStructuredErrorType) implementationGaps.push('未检测到统一结构化错误类型')
  if (messageCalls > 1 && !currentErrorPresentation.hasDuplicateSuppression) implementationGaps.push('存在多个全局提示分支，未检测到重复提示抑制机制')
  if (statusCodes.includes(403)) {
    const current403Behavior = {
      clearsCredential: /removeToken|removeCookie|clearToken/.test(source),
      resetsGlobalState: /dispatch\s*\([^)]*reset|commit\s*\([^)]*RESET/i.test(source),
      redirectsToLogin: /(?:replace|push)\s*\([^)]*(?:login|signin)/is.test(source),
      hasSingleFlightGuard: /isRedirecting|authFailureHandled|singleFlight|logoutPromise/.test(source)
    }
    addFact('auth.current403Behavior', 'api', current403Behavior, 'confirmed', 'source scan', `${entry}:HTTP 403 handler`)
    if (!current403Behavior.resetsGlobalState) implementationGaps.push('HTTP 403 当前未重置全局登录状态')
    if (!current403Behavior.hasSingleFlightGuard) implementationGaps.push('HTTP 403 当前缺少并发单次处理保护')
  }
  if (implementationGaps.length) addFact('api.implementationGaps', 'api', implementationGaps, 'confirmed', 'source scan', entry)

  const authFile = firstExisting(['src/utils/auth.js', 'src/utils/auth.ts', 'src/auth.ts', 'app/auth.ts', 'lib/auth.dart'], 'file')
  if (authFile) {
    const authSource = read(authFile)
    const cookieKeyMatch = authSource.match(/TokenKey\s*=\s*['"]([^'"]+)['"]/) 
    const cookieKey = cookieKeyMatch && cookieKeyMatch[1]
    const storage = /Cookies\./.test(authSource) ? 'Cookie' : /localStorage/.test(authSource) ? 'localStorage' : /sessionStorage/.test(authSource) ? 'sessionStorage' : '项目自定义存储'
    addFact('auth.storage', 'security', storage, 'confirmed', 'source scan', authFile)
    if (cookieKey) addFact('auth.tokenKey', 'security', cookieKey, 'confirmed', 'source scan', `${authFile}:TokenKey`)
  }
  const guard = firstExisting(['src/permission.js', 'src/permission.ts', 'src/router/guards.ts', 'src/middleware/auth.ts', 'middleware/auth.ts'], 'file')
  if (guard) addFact('auth.guardEntry', 'security', guard, 'confirmed', 'filesystem', guard)
}

function collectDomainMap(pageDir, apiDir) {
  const domains = []
  if (pageDir && exists(pageDir)) {
    for (const entry of fs.readdirSync(path.join(ROOT, pageDir), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) domains.push({ name: entry.name, pageRoot: path.join(pageDir, entry.name) })
    }
  }
  const routeFiles = ['src/router/index.js', 'src/router/index.ts', 'routes/index.js', 'config/routes.js'].filter(exists)
  const routePaths = []
  for (const routeFile of routeFiles) {
    const source = read(routeFile)
    for (const match of source.matchAll(/path\s*:\s*['"](\/[^'"]*)['"]/g)) routePaths.push(match[1])
  }
  const apiFiles = apiDir ? listFiles(apiDir, 3).filter(file => /\.(js|ts|py|go|java|php|rb)$/.test(file)).slice(0, 100) : []
  return { domains, routePaths: [...new Set(routePaths)], apiFiles, routeFiles }
}

function scanDomains() {
  const pageDir = factValue('dir.pages')
  const apiDir = factValue('dir.api')
  const domainMap = collectDomainMap(pageDir, apiDir)
  addFact('domain.map', 'business', { domains: domainMap.domains, routePaths: domainMap.routePaths, apiFiles: domainMap.apiFiles }, domainMap.domains.length || domainMap.routePaths.length || domainMap.apiFiles.length ? 'confirmed' : 'undefined', 'repository structure scan', [pageDir, ...domainMap.routeFiles, apiDir].filter(Boolean))
  const businessDoc = firstExisting(['BUSINESS_RULES.md', 'docs/business.md', 'docs/business-rules.md', 'docs/domain.md'], 'file')
  if (businessDoc) addFact('business.rulesDocument', 'business', businessDoc, 'confirmed', 'filesystem', businessDoc)
}

function scanAll() {
  scanProjectIdentity()
  scanTechnology()
  scanDirectories()
  scanGit()
  scanCommandsAndTests()
  scanFrontendAndState()
  scanApiAndAuth()
  scanDomains()
}

function makeReadline() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout })
}

function question(prompt) {
  if (NON_INTERACTIVE) return Promise.resolve('')
  return new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())))
}

async function askText(label, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const answer = await question(`${label}${suffix}: `)
  return answer || defaultValue
}

async function askYesNo(label, defaultYes = true) {
  const answer = (await question(`${label} ${defaultYes ? '[Y/n]' : '[y/N]'}: `)).toLowerCase()
  if (!answer) return defaultYes
  return ['y', 'yes'].includes(answer)
}

async function askChoice(label, options, defaultIndex = 0) {
  if (NON_INTERACTIVE) return options[defaultIndex]
  process.stdout.write(`\n${label}\n`)
  options.forEach((option, index) => process.stdout.write(`  ${index + 1}) ${option}\n`))
  while (true) {
    const answer = await question(`请选择 [${defaultIndex + 1}]: `)
    if (!answer) return options[defaultIndex]
    const selected = Number(answer) - 1
    if (selected >= 0 && selected < options.length) return options[selected]
  }
}

function recordAnswer(id, module, value) {
  const existing = fact(id)
  const previousAnswer = EXISTING_MANIFEST && EXISTING_MANIFEST.answers && EXISTING_MANIFEST.answers[id]
  if (NON_INTERACTIVE && previousAnswer && ['user-confirmed', 'not-applicable'].includes(previousAnswer.status) && JSON.stringify(previousAnswer.value) === JSON.stringify(value)) {
    answers[id] = { ...previousAnswer, verifiedAt: VERIFIED_AT }
    addFact(id, module, value, previousAnswer.status, 'wizard', 'preserved user answer')
    return
  }
  if (NON_INTERACTIVE && existing && existing.status === 'confirmed' && JSON.stringify(existing.value) === JSON.stringify(value)) {
    answers[id] = { value, status: 'confirmed', verifiedAt: VERIFIED_AT, source: existing.evidence }
    return
  }
  const hasValue = value && !/未定义|未配置|暂无|需确认|后续补充/.test(String(value))
  const status = !hasValue ? 'undefined' : /^不适用(?:[：,:，]|$)/.test(String(value)) ? 'not-applicable' : NON_INTERACTIVE ? 'inferred' : 'user-confirmed'
  answers[id] = { value, status, verifiedAt: VERIFIED_AT }
  addFact(id, module, value, answers[id].status, 'wizard', NON_INTERACTIVE ? 'recommended default' : 'user answer')
}

function evidenceLabel(evidence) {
  const value = String(evidence || '').trim()
  if (!value) return ''
  if (value === 'user answer' || value === 'preserved user answer') return '用户确认'
  if (value === 'recommended default') return '推荐默认值'
  return value
}

function evidenceLabels(evidence) {
  const values = Array.isArray(evidence) ? evidence : [evidence]
  return [...new Set(values.map(evidenceLabel).filter(Boolean))]
}

function moduleFindings(module) {
  return facts.filter(item => item.module === module).map(item => {
    const evidence = evidenceLabels(item.evidence).join(', ')
    return `- ${item.id}: ${markdownValue(item.value)}（${item.status}${evidence ? `；${evidence}` : ''}）`
  }).join('\n') || '- 未发现可确认事实。'
}

async function configureModule(module, questions, defaultEnabled = true) {
  note(`模块：${MODULES[module]}`)
  process.stdout.write(`${moduleFindings(module)}\n`)
  const previousStatus = EXISTING_MANIFEST && EXISTING_MANIFEST.modules && EXISTING_MANIFEST.modules[module] && EXISTING_MANIFEST.modules[module].status
  const enabled = await askYesNo(`是否配置${MODULES[module]}规则？`, previousStatus === 'ignored' ? false : defaultEnabled)
  if (!enabled) {
    moduleChoices[module] = 'ignored'
    return
  }
  moduleChoices[module] = 'enabled'
  for (const item of questions) {
    const suggested = typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue
    const value = await askText(item.label, previousValue(item.id, suggested))
    recordAnswer(item.id, module, value)
  }
}

function commandSummary() {
  const commands = factValue('testing.commands', [])
  if (!commands.length) return '未检测到，需人工确认'
  const qualityCommands = commands.filter(command => ['lint', 'test', 'build'].includes(command.category))
  return qualityCommands.filter(command => !command.longRunning).map(command => {
    const effects = []
    if (command.writesSource) effects.push('改写源码')
    if (command.writesArtifacts) effects.push('写入产物')
    if (command.writesCache) effects.push('写入缓存')
    return `${command.name}${effects.length ? `（${effects.join('、')}）` : ''}`
  }).join('；')
}

async function collectAnswers() {
  const hasExistingProjectEvidence = exists('.git') || ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'composer.json'].some(exists)
  const previousKind = previousValue('project.kind', '')
  const kindLabel = await askChoice('当前项目类型？', ['已有项目', '新项目'], previousKind ? (previousKind === 'new' ? 1 : 0) : hasExistingProjectEvidence ? 0 : 1)
  const selectedKind = kindLabel === '已有项目' ? 'existing' : 'new'
  const kindStatus = NON_INTERACTIVE && previousKind === selectedKind ? 'user-confirmed' : NON_INTERACTIVE ? 'inferred' : 'user-confirmed'
  const kindEvidence = previousKind === selectedKind ? 'preserved user answer' : NON_INTERACTIVE ? 'recommended default' : 'user answer'
  addFact('project.kind', 'architecture', selectedKind, kindStatus, 'wizard', kindEvidence)
  const previousScope = previousValue('project.scope', '')
  const inferredScope = previousScope || inferProjectScope()
  const scopeLabel = await askChoice('项目侧重？', ['前端项目', '后端项目', '全栈项目'], ['frontend', 'backend', 'fullstack'].indexOf(inferredScope))
  const selectedScope = { 前端项目: 'frontend', 后端项目: 'backend', 全栈项目: 'fullstack' }[scopeLabel] || 'frontend'
  const scopeStatus = NON_INTERACTIVE && previousScope === selectedScope ? 'user-confirmed' : NON_INTERACTIVE ? 'inferred' : 'user-confirmed'
  const scopeEvidence = previousScope === selectedScope ? 'preserved user answer' : NON_INTERACTIVE ? 'repository structure inference' : 'user answer'
  addFact('project.scope', 'architecture', selectedScope, scopeStatus, 'wizard', scopeEvidence)
  const scope = projectScope()
  const isBackendScope = scope === 'backend' || scope === 'fullstack'
  const projectName = await askText('项目名称', previousValue('project.name', factValue('project.name', path.basename(ROOT))))
  recordAnswer('project.name', 'architecture', projectName)
  recordAnswer('project.description', 'architecture', await askText('项目业务描述', previousValue('project.description', '未定义，新增场景需人工确认')))
  recordAnswer('project.outputLanguage', 'architecture', await askText('AI 回复、规则文档、交付说明默认语言', previousValue('project.outputLanguage', '中文')))

  await configureModule('architecture', [
    { id: 'policy.directoryBoundaries', label: '页面、服务、共享、API、状态和资源目录边界', defaultValue: isBackendScope ? '以扫描确认的目录为准；入口层只做协议适配，业务规则进入 service/domain，数据访问进入 repository/DAO' : '以扫描确认的目录为准；页面私有逻辑保持局部，稳定跨域能力进入共享目录' },
    { id: 'policy.newDirectories', label: '新增目录策略', defaultValue: '允许在需要时新增，但必须遵守现有目录边界，不为未来复用提前设计结构' },
    { id: 'policy.featureBoundary', label: '领域 / feature 组织边界', defaultValue: () => factValue('dir.pages') ? `优先沿用 ${factValue('dir.pages')} 下现有业务分组` : factValue('dir.services') ? `优先沿用 ${factValue('dir.services')} 下现有服务分组` : '未定义，新增场景需人工确认' }
  ])
  await configureModule('codeQuality', [
    { id: 'policy.dataContract', label: '数据契约层策略', defaultValue: '按接口复杂度和既有模式决定；高风险外部数据必须显式标准化' },
    { id: 'policy.legacyGovernance', label: '存量模块治理策略', defaultValue: '只做触达范围内的增量治理，除非明确要求，不一次性重构旧模块' },
    { id: 'policy.modelPlacement', label: '类型、模型、mapper、normalizer、adapter 放置规则', defaultValue: isBackendScope ? '区分 API DTO、领域模型、持久化模型和查询视图；转换逻辑靠近边界，不让 ORM 实体直接成为外部契约' : '优先放在使用范围最低的位置；跨页面稳定复用后再提升到共享目录' },
    { id: 'policy.indexMaintenance', label: '代码资产、复用候选和业务域地图维护规则', defaultValue: '新增或修改共享资产、重要流程和业务域时同步更新对应索引' },
    { id: 'policy.encapsulationBoundary', label: '入口私有、领域共享和项目共享边界', defaultValue: isBackendScope ? 'Controller/handler 只做协议适配；领域内复用放领域边界；跨领域能力进入项目共享层' : '一次性逻辑保持局部；领域内复用放领域边界；稳定跨领域能力进入项目共享层' },
    { id: 'policy.crossProjectPackages', label: '跨项目包 / 共享库策略', defaultValue: '除非已有明确建设计划，不为未来跨项目复用提前设计包结构' }
    ,{ id: 'policy.documentation', label: '注释、临时方案和复杂业务规则文档化', defaultValue: '注释解释原因；临时方案记录风险和清理条件；复杂业务规则进入权威文档' }
  ])
  await configureModule('ui', [
    { id: 'policy.uiDesignSource', label: '设计系统、主题、样式和输入来源', defaultValue: '优先需求与设计系统，其次既有页面和组件库默认行为' },
    { id: 'policy.uiComponentBoundary', label: '页面私有与共享组件准入', defaultValue: '至少两个真实复用点或稳定基础能力才进入共享组件目录' },
    { id: 'policy.uiLayoutFeedback', label: '布局、浮层、加载和交互反馈', defaultValue: '明确滚动与固定区域；区分首次、局部、分页和提交加载；防止重复触发' },
    { id: 'policy.uiFormBehavior', label: '表单、破坏性操作和失败保留', defaultValue: '提交失败保留输入；不可逆操作二次确认；前端校验不替代后端' },
    { id: 'policy.uiFallback', label: '缺少设计细节时的处理', defaultValue: '先检查既有页面模式，再遵循组件库默认行为；仅做最小一致性补全' },
    { id: 'policy.uiPresentation', label: '文案、响应式、可访问性、视觉变量和图标', defaultValue: '沿用项目术语和视觉资产；验证焦点、对比度、点击区域、长文本和关键断点' },
    { id: 'policy.uiVerification', label: 'UI 验证要求', defaultValue: '按影响范围验证目标设备、关键断点、加载态、空态和错误态' }
  ], projectScope() !== 'backend' && Boolean(fact('ui.library') || factValue('dir.pages') || projectScope() === 'fullstack'))
  await configureModule('api', [
    { id: 'policy.errorClassification', label: '错误对象、分类和状态码类型规范', defaultValue: '区分网络、超时、认证、权限、业务、服务端和解析错误；状态码按契约类型比较' },
    { id: 'policy.errorDisplay', label: '默认错误展示 / 响应机制', defaultValue: isBackendScope ? '优先沿用统一错误处理中间件或异常过滤器；入口和调用方不得重复包装、重复上报或吞掉同一错误' : '优先沿用统一请求入口的既有机制，页面不得重复提示同一错误' },
    { id: 'policy.authSemantics', label: '401、403 与业务权限码语义', defaultValue: '未定义，需由接口契约或业务负责人确认' },
    { id: 'policy.authCleanup', label: '认证失效清理范围', defaultValue: '凭证、用户状态、权限状态、账号相关缓存和持久化数据' },
    { id: 'policy.concurrentAuthFailure', label: '并发认证失效处理', defaultValue: '同一失效周期只允许一次提示、一次清理和一次登录跳转' },
    { id: 'policy.silentRequest', label: '静默请求规则', defaultValue: '先检查统一请求封装；关键写操作和认证请求不得静默失败' }
    ,{ id: 'policy.requestLifecycle', label: '重试、轮询、取消、过期响应和防重复提交', defaultValue: '按幂等性决定重试；轮询和订阅必须清理；写操作防重复；过期响应不得覆盖新状态' }
    ,{ id: 'policy.apiObservability', label: 'API 日志、可观测性和脱敏', defaultValue: '记录必要上下文和高风险失败；禁止记录完整凭证、隐私和支付数据' }
    ,...(isBackendScope ? [
      { id: 'policy.apiContract', label: '后端 API 契约、DTO 和响应格式', defaultValue: '外部 API 使用稳定 DTO/Schema 和统一错误响应；不直接暴露 ORM 实体、内部异常和第三方原始错误' },
      { id: 'policy.backendLayering', label: 'Controller / Service / Repository 边界', defaultValue: 'Controller/handler 负责协议适配和校验编排；service/use case 承载业务流程；repository/DAO 负责持久化访问' },
      { id: 'policy.idempotency', label: '幂等、重复提交和并发写入策略', defaultValue: '创建、支付、提交、审批、回调和状态流转需按风险定义幂等键、唯一约束、锁或状态机' },
      { id: 'policy.downstreamCalls', label: '下游调用超时、重试和降级', defaultValue: '下游调用必须定义超时、错误映射和脱敏日志；重试只用于幂等或可补偿场景' }
    ] : [])
  ], Boolean(fact('api.entry') || isBackendScope))
  await configureModule('state', [
    { id: 'policy.globalStateBoundary', label: '全局状态 / 服务缓存边界', defaultValue: isBackendScope ? '请求内临时数据保持局部；跨请求共享状态必须有失效、隔离和并发策略；避免把业务事实只放进进程内存' : '跨页面稳定共享数据进入全局状态；临时 UI、表单中间值和大型响应保持局部' },
    { id: 'policy.serverAuthority', label: '必须以服务端为准的数据', defaultValue: '金额、系统时间、权限和关键业务状态；其他数据按业务域确认' },
    { id: 'policy.persistence', label: '持久化策略', defaultValue: isBackendScope ? '数据写入必须明确事务边界、迁移方式、回滚策略、索引影响和缓存失效；高风险数据需审计' : fact('auth.storage') ? `沿用已确认的 ${factValue('auth.storage')} 实现；新增持久化需定义失效与账号隔离` : '新增持久化前先检查现有实现，并定义失效与账号隔离' }
    ,{ id: 'policy.stateTransformation', label: '接口转换、派生数据和枚举标准化', defaultValue: '外部数据按风险标准化；派生数据不重复存储；未知枚举保留安全兜底' }
    ,{ id: 'policy.crossPageData', label: '跨页面 / 跨服务 / 跨任务传递边界', defaultValue: isBackendScope ? '跨服务和消息传递只传必要标识与稳定 payload；权限上下文、隐私和大型对象不得作为不可信载荷扩散' : '公开标识和筛选可进 URL；凭证、隐私、支付信息、复杂对象和大型 payload 禁止进入 URL' }
    ,{ id: 'policy.asyncState', label: '异步一致性和数据阶段', defaultValue: isBackendScope ? '处理过期响应、并发覆盖、任务重试、消息乱序和补偿状态；不得把任务已提交等同于业务已完成' : '处理过期响应、并发覆盖、卸载清理、流程恢复；loading/empty/error/success 与真实阶段一致' }
    ,...(isBackendScope ? [
      { id: 'policy.transactionBoundary', label: '数据库事务、锁和一致性边界', defaultValue: '多表写入、资金、库存、订单、审批和权限变更必须明确事务、唯一约束、版本号、锁或状态机' },
      { id: 'policy.migrationStrategy', label: '数据库迁移、回填和回滚策略', defaultValue: 'schema 变更需考虑兼容、默认值、回填、索引构建、回滚和线上影响' },
      { id: 'policy.cacheInvalidation', label: '缓存 key、失效和隔离策略', defaultValue: '缓存必须定义 key、过期、刷新、穿透/击穿/雪崩防护，以及账号、租户、权限和环境隔离' },
      { id: 'policy.jobsMessaging', label: '任务、队列、重试、死信和补偿', defaultValue: '异步任务需定义触发来源、幂等键、超时、重试、死信、补偿和可诊断执行记录' }
    ] : [])
  ], Boolean(fact('state.library') || isBackendScope))
  await configureModule('security', [
    { id: 'policy.sensitiveFields', label: '敏感字段清单', defaultValue: 'token、session、密钥、证件号、手机号、邮箱、地址、支付信息、生产账号和内部配置' },
    { id: 'policy.credentialLifecycle', label: '凭证、会话和账号切换清理', defaultValue: '退出、失效、切换账号和权限变化时清理凭证、状态、缓存和持久化数据' },
    { id: 'policy.dataExposure', label: 'URL、日志、错误、埋点、截图和提交记录限制', defaultValue: '敏感信息不得进入这些载体；日志仅保留脱敏诊断上下文' },
    { id: 'policy.permissionBoundary', label: '权限入口和前后端边界', defaultValue: isBackendScope ? '所有受保护接口、后台任务、导出和回调必须执行服务端鉴权；权限判断集中维护且靠近资源和操作语义' : '前端权限仅控制展示和交互；后端必须独立鉴权；权限判断集中维护' },
    { id: 'policy.pathAndExternalUrl', label: '部署路径、资源前缀、外链、下载和 callback URL', defaultValue: '沿用统一路径配置；外部目标必须校验可信来源，禁止直接拼接用户输入' },
    { id: 'policy.dynamicContent', label: '上传、富文本、Markdown、动态 HTML 和预览', defaultValue: '按场景定义类型、大小、来源、净化、预览和下载策略；未启用能力明确标记不适用' },
    { id: 'policy.performancePaths', label: '关键性能路径', defaultValue: '首屏、登录、核心列表、搜索和提交保存' },
    { id: 'policy.performanceBudget', label: '性能预算、列表和大资源策略', defaultValue: '未量化时至少禁止明显退化；列表分页/虚拟化，大资源按需加载并限制体积' },
    { id: 'policy.cacheAndConcurrency', label: '并发、轮询、高频事件、缓存和降级', defaultValue: '限制并发与无限轮询；高频事件节流/去抖；缓存定义失效、账号隔离、权限隔离和降级' }
    ,...(isBackendScope ? [
      { id: 'policy.tenantIsolation', label: '租户、组织、项目或账号数据隔离', defaultValue: '隔离维度必须来自服务端可信上下文；查询、更新、删除、导出和统计必须带隔离条件' },
      { id: 'policy.auditLogging', label: '审计日志范围', defaultValue: '登录、权限变更、资金、订单、审批、导出、删除、配置修改和越权失败应记录操作者、资源、动作、结果和请求标识' },
      { id: 'policy.secretManagement', label: '密钥、环境变量和内部配置管理', defaultValue: '密钥和生产配置不得进入代码、日志、错误响应、提交记录和普通文档；读取来源和轮换策略按项目规则确认' }
    ] : [])
  ])
  await configureModule('testingGit', [
    { id: 'git.protectedBranches', label: `受保护分支（当前 ${factValue('git.currentBranch', '未知')}，候选 ${markdownValue(factValue('git.branchCandidates', []))}；多个用逗号分隔）`, defaultValue: '未定义，需人工确认' },
    { id: 'policy.testStrategy', label: '自动化测试策略', defaultValue: factValue('testing.files', []).length ? '已有测试覆盖的行为发生变化时必须更新测试；新增高风险逻辑应补测试' : '项目暂无测试体系时不强行引入，使用项目定义的替代验证' },
    { id: 'policy.highRiskGate', label: '高风险变更最小门禁', defaultValue: `执行非修改型检查、相关测试、构建和核心链路手动回归；当前命令：${commandSummary()}` },
    { id: 'policy.branchNaming', label: '需求、修复、重构和实验分支命名', defaultValue: 'feat/、fix/、refactor/、chore/ + kebab-case；遵循仓库既有前缀' },
    { id: 'policy.commitStyle', label: '提交信息格式', defaultValue: 'Conventional Commits + 项目默认语言描述' },
    { id: 'policy.wipCommits', label: 'WIP 和最终提交整理', defaultValue: '开发中允许 WIP；最终交付前按项目要求合并或整理临时提交' },
    { id: 'policy.releaseBoundary', label: 'PR、CI、发布、tag 和推送边界', defaultValue: '默认由人工或 CI 执行；AI 仅在用户明确要求和授权后执行' },
    { id: 'policy.gitSafety', label: '禁止提交文件和高风险 Git 操作', defaultValue: '禁止敏感配置、依赖缓存和无关产物；强推、重写历史、删除分支和清空工作区需明确授权' },
    { id: 'policy.coreFlows', label: '核心业务链路和必须更新测试的场景', defaultValue: '登录、权限、金额、支付、订单、提交、删除、路由、数据同步和全局共享行为' },
    { id: 'policy.manualRegression', label: '手动回归、UI/API/任务验证和环境不可用记录', defaultValue: isBackendScope ? '记录环境、接口/任务、输入、预期、实际和结果；环境不可用时记录未验证项与原因' : '记录环境、步骤、输入、预期、实际和结果；环境不可用时记录未验证项与原因' },
    { id: 'policy.testBoundaries', label: '关键数据、边界场景和剩余风险', defaultValue: '覆盖空值、缺失字段、未知枚举、权限不足、重复提交、异常响应；交付时记录剩余风险' }
  ])
  await configureModule('business', [
    { id: 'policy.businessRuleSource', label: '业务规则主文档或来源', defaultValue: factValue('business.rulesDocument', '未定义，新增业务语义时需人工确认') },
    { id: 'policy.highRiskDomains', label: '高风险业务域', defaultValue: '金额、权限、审核、支付、订单、发布、删除、禁用和不可逆状态流转' },
    { id: 'policy.businessEnums', label: '状态、枚举、权限码和状态码来源', defaultValue: '优先权威业务文档和接口契约；代码只能作为现状证据，未知语义需确认' }
  ], Boolean(fact('domain.map') && fact('domain.map').status === 'confirmed'))
}

function moduleStatus(module) {
  if (moduleChoices[module] === 'ignored') return { status: 'ignored', missing: [], coverage: [], dimensions: { strategy: 'ignored', repositoryFacts: 'ignored', businessContracts: 'ignored' } }
  const coverage = (COVERAGE_CATALOG[module] || []).map(([id, label, factIds]) => {
    const missingFacts = factIds.filter(factId => {
      const item = fact(factId)
      return !item || !['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
    })
    return { id, label, factIds, status: missingFacts.length ? 'missing' : 'covered', missingFacts }
  })
  const missing = coverage.filter(item => item.status === 'missing').map(item => item.id)
  const strategyCoverage = coverage.filter(item => item.factIds.some(id => id.startsWith('policy.')))
  const strategy = strategyCoverage.length ? (strategyCoverage.some(item => item.status === 'missing') ? 'partial' : 'configured') : 'not-applicable'
  const repositoryFacts = facts.filter(item => item.module === module && item.source !== 'wizard')
  const repositoryStatus = !repositoryFacts.length ? 'not-found' : repositoryFacts.every(item => item.status === 'confirmed') ? 'confirmed' : 'partial'
  const contractIds = BUSINESS_CONTRACT_FACTS[module] || []
  const businessContracts = !contractIds.length ? 'not-applicable' : contractIds.every(id => {
    const item = fact(id)
    return item && ['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
  }) ? 'confirmed' : 'partial'
  return { status: missing.length ? 'partial' : 'configured', missing, coverage, dimensions: { strategy, repositoryFacts: repositoryStatus, businessContracts } }
}

function statusLabel(status) {
  return { configured: '已配置', partial: '部分配置', ignored: '已忽略', unconfigured: '未配置' }[status] || status
}

function coverageLabel(status) {
  return { configured: '结构覆盖完整', partial: '结构部分覆盖', ignored: '已忽略', unconfigured: '未配置' }[status] || status
}

function dimensionLabel(dimension, status) {
  const labels = {
    strategy: { configured: '策略已配置', partial: '策略部分配置', 'not-applicable': '策略不适用', ignored: '策略已忽略' },
    repositoryFacts: { confirmed: '仓库事实已确认', partial: '仓库事实部分确认', 'not-found': '未发现仓库事实', ignored: '仓库事实已忽略' },
    businessContracts: { confirmed: '业务契约已确认', partial: '业务契约部分确认', 'not-applicable': '业务契约不适用', ignored: '业务契约已忽略' }
  }
  return (labels[dimension] && labels[dimension][status]) || status
}

function metadata(module) {
  const state = moduleStatus(module)
  const status = statusLabel(state.status)
  const missing = state.missing && state.missing.length ? `，仍缺少 ${state.missing.map(item => `\`${item}\``).join('、')}` : ''
  const lines = [
    `> 状态：${status}${missing}`,
    `> 最后核验：${VERIFIED_AT}`
  ]
  return `${lines.join('  \n')}\n`
}

function sourceFact(id, label) {
  const item = fact(id)
  if (!item) return `- ${label}：未定义。`
  const statusNote = {
    inferred: '（推断，待确认）',
    undefined: '（待补充）'
  }[item.status] || ''
  return `- ${label}：${markdownValue(item.value)}。${statusNote}`
}

function write(relative, content) {
  const full = path.join(ROOT, relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, `${content.trim()}\n`)
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath)
    else fs.copyFileSync(sourcePath, targetPath)
  }
}

function copyShared() {
  if (!fs.existsSync(SHARED_TEMPLATE_DIR)) throw new Error(`缺少 shared 模板目录：${SHARED_TEMPLATE_DIR}`)
  for (const file of selectedSharedTemplates()) {
    if (!sharedTemplateExists(file)) throw new Error(`缺少 shared 模板文件：${file}`)
    fs.copyFileSync(path.join(SHARED_TEMPLATE_DIR, file), path.join(RULE_DIR, file))
  }
}

function projectScope() {
  const value = factValue('project.scope', 'frontend')
  return PROJECT_SCOPES[value] ? value : 'frontend'
}

function selectedSharedTemplates(scope = projectScope()) {
  const templates = [...COMMON_SHARED_TEMPLATES]
  if (scope === 'frontend' || scope === 'fullstack') templates.push(...FRONTEND_SHARED_TEMPLATES)
  if (scope === 'backend' || scope === 'fullstack') templates.push(...BACKEND_SHARED_TEMPLATES)
  return templates
}

function sharedTemplateExists(template) {
  return fs.existsSync(path.join(SHARED_TEMPLATE_DIR, template))
}

function renderStatusLines(modules) {
  return modules.map(module => {
    const state = moduleStatus(module)
    const detail = state.missing.length ? `；未覆盖：${state.missing.join('、')}` : ''
    const dimensions = state.dimensions ? `；${dimensionLabel('strategy', state.dimensions.strategy)}；${dimensionLabel('repositoryFacts', state.dimensions.repositoryFacts)}；${dimensionLabel('businessContracts', state.dimensions.businessContracts)}` : ''
    return `- ${MODULES[module]}：${coverageLabel(state.status)}${dimensions}${detail}`
  }).join('\n')
}

function renderAgents() {
  write('AGENTS.md', `# Project Rules

本项目规则位于 \`.agent-rules/\`。

任何代码修改、规则维护、测试验证、Git 操作前，必须先读取 \`.agent-rules/project-index.md\` 和 \`.agent-rules/project-custom.md\`，并按任务路由读取必要规则。禁止无差别读取所有规则文件。`)
}

function ensureCustomRules() {
  const relative = '.agent-rules/project-custom.md'
  if (exists(relative)) return
  write(relative, `# 项目人工补充规则

本文件由项目维护者手工维护，生成器不会覆盖。

仅记录无法由仓库扫描稳定推导、但已由项目负责人确认的特殊规则、例外和业务约束。

## 当前补充

- 暂无。`)
}

function renderIndex() {
  const scope = projectScope()
  const routeLines = [
    '- 架构、目录、路由/入口新增：`project-architecture.md`、`project-code-quality.md`、`shared-code-quality.md`。'
  ]
  if (scope !== 'backend') routeLines.push('- UI、组件、样式、交互：`project-ui-rules.md`、`project-architecture.md`、`shared-ui-rules.md`。')
  routeLines.push(
    '- API、错误、登录失效、权限：`project-api-error-handling.md`、`project-security-performance.md`、`project-state-data-flow.md` 及对应 shared 文件。',
    '- 状态、持久化、跨边界数据：`project-state-data-flow.md`、`project-security-performance.md` 及对应 shared 文件。',
    '- 安全、性能、资源路径、外部跳转、上传和缓存：`project-security-performance.md`、`project-architecture.md`、`shared-security-performance.md`。'
  )
  if (scope !== 'frontend') {
    routeLines.push(
      '- 后端接口、入参校验、响应契约、服务层错误：`project-backend-api-contracts.md`、`project-api-error-handling.md`、`shared-backend-api-contracts.md`。',
      '- 数据库、事务、迁移、缓存一致性：`project-backend-data-persistence.md`、`project-state-data-flow.md`、`shared-backend-data-persistence.md`。',
      '- 后端鉴权、租户隔离、审计和敏感数据：`project-backend-auth-security.md`、`project-security-performance.md`、`shared-backend-auth-security.md`。',
      '- 队列、定时任务、重试、死信和补偿：`project-backend-jobs-messaging.md`、`project-state-data-flow.md`、`shared-backend-jobs-messaging.md`。',
      '- 日志、指标、链路追踪、告警和值班诊断：`project-backend-observability.md`、`project-testing-quality-gates.md`、`shared-backend-observability.md`。'
    )
  }
  routeLines.push(
    '- 测试、构建、交付：`project-testing-quality-gates.md`、`project-git-delivery.md` 及对应 shared 文件。',
    '- Git：`project-git-delivery.md`、`shared-git-delivery.md`。',
    '- 业务：`project-business-rules.md`、`project-domain-map.md` 及权威业务文档。',
    '- 代码资产、复用判断、抽象和重构审查：`project-code-inventory.md`、`project-reuse-candidates.md`、`project-domain-map.md`、`project-code-quality.md`、`shared-code-quality.md`。',
    '- 规则维护：读取待修改 project 文件、对应 shared 文件、`project-facts.json`、相关事实来源和 `shared-project-requirements-check.md`。'
  )
  const sharedList = selectedSharedTemplates(scope).map(file => `\`${file}\``).join('、')
  write('.agent-rules/project-index.md', `# 规则索引

本文件是轻量入口。shared 是跨项目通用底线，project 是当前项目事实、策略和例外。

项目侧重：${PROJECT_SCOPES[scope]}。当前生成的 shared 模板：${sharedList}。

## 1. 指令优先级

1. 系统、平台和安全策略。
2. 开发者、工具和 skill 强制指令。
3. 用户本轮明确要求。
4. 当前作用域的 \`AGENTS.md\` / \`CLAUDE.md\`。
5. 已确认业务规则、接口契约和权威业务文档。
6. 人工维护的 \`project-custom.md\`。
7. 生成的当前项目 \`project-*\` 规则。
8. \`shared-*\` 通用规则。
9. 代码模式、历史对话和模型推断。

## 2. 默认读取

任务开始读取本文件和 \`project-custom.md\`，再按任务类型加载必要规则。不得为了保险全量读取。

## 3. 任务路由

${routeLines.join('\n')}

## 4. 决策顺序

先读规则与事实清单，再检查指定入口和局部代码，存在明确模式则沿用；仅在新增业务语义、证据冲突、高风险或不可逆选择时询问用户。

## 5. 模块状态

${renderStatusLines(Object.keys(MODULES))}

## 6. 事实有效性

- 事实清单：\`project-facts.json\`。
- 最后核验：${VERIFIED_AT}。
- 使用 \`${COMMAND} --verify\` 检查模板漂移、来源缺失和事实过期。

## 7. 默认输出语言

AI 回复、规则文档、交付说明和代码注释默认使用${markdownValue(factValue('project.outputLanguage', '未定义，新增场景需人工确认'))}。`)
}

function renderSummary() {
  write('.agent-rules/project-summary.md', `# 项目规则摘要

本文件由 \`project-facts.json\` 生成，不作为独立事实源。

## 项目

${sourceFact('project.name', '项目名称')}
${sourceFact('project.kind', '项目类型')}
${sourceFact('project.scope', '项目侧重')}
${sourceFact('stack.technologies', '技术栈')}
${sourceFact('git.repository', 'Git 仓库状态')}
${sourceFact('git.currentBranch', '当前分支')}
${sourceFact('git.defaultBranchCandidate', '默认分支候选')}

## 模块状态

${renderStatusLines(Object.keys(MODULES))}

## 使用原则

- 先检查规则指定入口和事实来源，再局部搜索。
- 已确认事实可直接沿用；推断事实需验证；未定义项只在影响当前任务时处理。
- 新业务语义、高风险冲突和不可逆选择才需要人工确认。`)
}

function renderProjectRules() {
  const commands = factValue('testing.commands', [])
  const testFiles = factValue('testing.files', [])
  const domains = factValue('domain.map', { domains: [], routePaths: [], apiFiles: [] })
  const scope = projectScope()
  const isBackendScope = scope === 'backend' || scope === 'fullstack'
  const commandLines = commands.length ? commands.map(command => `- \`${command.name}\`：${command.raw || command.source || '检测自项目配置'}；类别：${command.category}；改写源码：${command.writesSource ? '是' : '否'}；写入产物：${command.writesArtifacts ? '是' : '否'}；写入缓存：${command.writesCache ? '是' : '否'}；长期运行：${command.longRunning ? '是' : '否'}；适合自动执行：${command.safeForAutomaticExecution ? '是' : '否'}`).join('\n') : '- 未检测到验证命令。'
  const gitUnavailableNote = factValue('git.repository', true) === false
    ? '\n\n> 当前目录不是 Git 仓库，分支、远端 HEAD 和受保护分支无法自动扫描；如需 Git 交付规则，请先初始化 Git 或在人工补充规则中确认。'
    : ''
  const frontendArchitectureFacts = scope === 'backend' ? '' : `
${sourceFact('dir.pages', '页面目录')}
${sourceFact('dir.router', '路由目录')}
${sourceFact('dir.components', '共享组件目录')}`
  const backendArchitectureFacts = !isBackendScope ? '' : `
${sourceFact('dir.backendEntry', '后端入口目录')}
${sourceFact('dir.controllers', 'Controller / 路由处理目录')}
${sourceFact('dir.services', 'Service / use case 目录')}
${sourceFact('dir.repositories', 'Repository / DAO 目录')}
${sourceFact('dir.models', '领域 / 数据模型目录')}
${sourceFact('dir.migrations', '数据库迁移目录')}
${sourceFact('dir.jobs', '任务 / worker 目录')}
${sourceFact('dir.config', '配置目录')}`

  write('.agent-rules/project-architecture.md', `# 项目架构规则

${metadata('architecture')}

## 项目事实

${sourceFact('project.name', '项目名称')}
${sourceFact('project.description', '业务描述')}
${sourceFact('project.scope', '项目侧重')}
${sourceFact('stack.technologies', '技术栈')}
${sourceFact('dir.utils', '工具目录')}
${sourceFact('dir.api', 'API / service 目录')}
${sourceFact('dir.state', '状态目录')}
${frontendArchitectureFacts}${backendArchitectureFacts}

## 项目策略

${sourceFact('project.outputLanguage', '默认输出语言')}
${sourceFact('policy.directoryBoundaries', '目录边界')}
${sourceFact('policy.newDirectories', '新增目录')}
${sourceFact('policy.featureBoundary', '领域 / feature 边界')}`)

  write('.agent-rules/project-code-quality.md', `# 项目代码质量补充规则

${metadata('codeQuality')}

${sourceFact('policy.dataContract', '数据契约层')}
${sourceFact('policy.legacyGovernance', '存量治理')}
${sourceFact('policy.modelPlacement', '模型与转换位置')}
${sourceFact('policy.indexMaintenance', '索引维护')}
${sourceFact('policy.encapsulationBoundary', '封装边界')}
${sourceFact('policy.crossProjectPackages', '跨项目共享包')}
${sourceFact('policy.documentation', '注释与文档化')}

新增业务逻辑前按顺序检查 \`project-code-inventory.md\`、\`project-reuse-candidates.md\`、\`project-domain-map.md\`，索引不足时再做局部搜索。`)

  const componentsDir = factValue('dir.components')
  const componentFiles = componentsDir ? listFiles(componentsDir, 2).filter(file => /\.(vue|tsx?|jsx?|svelte)$/.test(file)).slice(0, 50) : []
  const backendDirs = ['dir.backendEntry', 'dir.controllers', 'dir.services', 'dir.repositories', 'dir.models', 'dir.migrations', 'dir.jobs', 'dir.config']
    .map(id => [id, factValue(id, '')])
    .filter(([, dir]) => dir)
  const backendFiles = backendDirs.flatMap(([id, dir]) => listFiles(dir, 2).slice(0, 30).map(file => ({ id, file }))).slice(0, 120)
  const componentInventory = scope === 'backend' ? '' : `
## 共享组件

${componentFiles.length ? componentFiles.map(file => `- \`${file}\``).join('\n') : '- 暂无已确认共享组件。'}`
  const backendInventory = !isBackendScope ? '' : `
## 后端入口与分层资产

${backendDirs.length ? backendDirs.map(([id, dir]) => `- ${id}：\`${dir}\``).join('\n') : '- 暂无已确认后端分层目录。'}

## 后端代表文件

${backendFiles.length ? backendFiles.map(item => `- ${item.id}：\`${item.file}\``).join('\n') : '- 暂无已确认后端代表文件。'}`
  write('.agent-rules/project-code-inventory.md', `# 项目代码资产索引

> 最后核验：${VERIFIED_AT}  
> 来源：仓库目录扫描

${componentInventory}${backendInventory}

## 核心入口

${sourceFact('api.entry', '统一请求入口')}
${sourceFact('auth.guardEntry', '认证 / 路由守卫')}
${sourceFact('state.directory', '状态目录')}`)

  write('.agent-rules/project-reuse-candidates.md', `# 项目复用候选索引

> 最后核验：${VERIFIED_AT}

暂无已确认候选项。发现重复业务判断、映射、校验、流程或 UI 结构时，应记录位置、语义和暂不抽象原因。`)

  if (scope !== 'backend') write('.agent-rules/project-ui-rules.md', `# 项目 UI 规则

${metadata('ui')}

${sourceFact('ui.library', 'UI 组件库')}
${sourceFact('dir.components', '共享组件目录')}
${sourceFact('policy.uiDesignSource', '设计与样式来源')}
${sourceFact('policy.uiComponentBoundary', '组件边界')}
${sourceFact('policy.uiLayoutFeedback', '布局与反馈')}
${sourceFact('policy.uiFormBehavior', '表单与破坏性操作')}
${sourceFact('policy.uiFallback', '缺少设计细节时')}
${sourceFact('policy.uiPresentation', '文案、响应式与可访问性')}
${sourceFact('policy.uiVerification', 'UI 验证')}

先检查既有页面和组件；只有新增产品语义、视觉规范冲突或不可逆交互时才询问。`)

  write('.agent-rules/project-api-error-handling.md', `# 项目 API 与错误处理规则

${metadata('api')}

## 已确认实现事实

${sourceFact('api.entry', '统一请求入口')}
${sourceFact('api.library', '请求库')}
${sourceFact('api.timeoutMs', '超时毫秒')}
${sourceFact('api.withCredentials', 'withCredentials')}
${sourceFact('api.headers', '统一请求头')}
${sourceFact('api.successBusinessCode', '成功业务码')}
${sourceFact('api.handledHttpStatuses', '当前显式处理的 HTTP 状态')}
${sourceFact('api.currentLogging', '当前日志行为')}
${sourceFact('api.currentErrorObject', '当前错误对象')}
${sourceFact('api.currentErrorPresentation', '当前错误提示')}
${sourceFact('auth.current403Behavior', '当前 HTTP 403 行为')}

## 已知实现差距

${sourceFact('api.implementationGaps', '扫描发现')}

## 目标策略

${sourceFact('policy.errorClassification', '错误分类与状态码类型')}
${sourceFact('policy.errorDisplay', '错误展示')}
${sourceFact('policy.authSemantics', '401 / 403 / 业务权限码语义')}
${sourceFact('policy.authCleanup', '认证失效清理')}
${sourceFact('policy.concurrentAuthFailure', '并发认证失效')}
${sourceFact('policy.silentRequest', '静默请求')}
${sourceFact('policy.requestLifecycle', '请求生命周期和防重复提交')}
${sourceFact('policy.apiObservability', 'API 可观测性与脱敏')}

## 执行顺序

先检查统一请求入口和认证守卫，沿用已确认模式；发现现状与目标策略不一致时记录为实现差距，不把现有缺陷提升为规则。

若当前 403 行为未清理全局状态、未区分权限不足或没有并发单次处理保护，应明确标记为实现差距，不得写成目标规范。`)

  if (isBackendScope) {
    write('.agent-rules/project-backend-api-contracts.md', `# 项目后端 API 契约规则

${metadata('api')}

## 后端入口事实

${sourceFact('dir.backendEntry', '后端入口目录')}
${sourceFact('dir.controllers', 'Controller / 路由处理目录')}
${sourceFact('dir.services', 'Service / use case 目录')}
${sourceFact('api.entry', '统一请求 / API 入口')}

## 契约策略

${sourceFact('policy.apiContract', 'API 契约、DTO 和响应格式')}
${sourceFact('policy.backendLayering', 'Controller / Service / Repository 边界')}
${sourceFact('policy.errorClassification', '错误分类与状态码类型')}
${sourceFact('policy.errorDisplay', '错误响应 / 展示机制')}
${sourceFact('policy.idempotency', '幂等、重复提交和并发写入')}
${sourceFact('policy.downstreamCalls', '下游调用超时、重试和降级')}

新增或修改后端 API 时，先确认入参来源、DTO/schema、响应格式、错误结构、兼容性和调用方迁移；不得把 ORM 实体、内部异常或第三方原始错误直接暴露为外部契约。`)

    write('.agent-rules/project-backend-data-persistence.md', `# 项目后端数据持久化规则

${metadata('state')}

## 已确认目录

${sourceFact('dir.repositories', 'Repository / DAO 目录')}
${sourceFact('dir.models', '领域 / 数据模型目录')}
${sourceFact('dir.migrations', '数据库迁移目录')}

## 持久化策略

${sourceFact('policy.persistence', '持久化策略')}
${sourceFact('policy.transactionBoundary', '事务、锁和一致性边界')}
${sourceFact('policy.migrationStrategy', '数据库迁移、回填和回滚')}
${sourceFact('policy.cacheInvalidation', '缓存 key、失效和隔离')}
${sourceFact('policy.serverAuthority', '服务端权威数据')}
${sourceFact('policy.stateTransformation', '数据转换与枚举标准化')}

涉及金额、库存、订单、审批、权限、状态流转和多表写入时，必须明确事务边界、并发控制、回滚/补偿和审计要求；不得凭字段名猜测业务语义。`)

    write('.agent-rules/project-backend-auth-security.md', `# 项目后端鉴权与安全规则

${metadata('security')}

## 已确认入口

${sourceFact('auth.guardEntry', '认证 / 权限入口')}
${sourceFact('auth.storage', '凭证存储')}
${sourceFact('auth.tokenKey', 'token key')}
${sourceFact('dir.config', '配置目录')}

## 安全策略

${sourceFact('policy.authSemantics', '401 / 403 / 业务权限码语义')}
${sourceFact('policy.authCleanup', '认证失效清理')}
${sourceFact('policy.permissionBoundary', '服务端权限边界')}
${sourceFact('policy.tenantIsolation', '租户 / 组织 / 项目隔离')}
${sourceFact('policy.auditLogging', '审计日志范围')}
${sourceFact('policy.secretManagement', '密钥和环境配置管理')}
${sourceFact('policy.sensitiveFields', '敏感字段')}
${sourceFact('policy.dataExposure', '敏感信息暴露限制')}

所有受保护接口、后台任务、导出和异步回调必须执行服务端可信鉴权与隔离；审计日志不得依赖客户端不可验证字段作为唯一事实来源。`)

    write('.agent-rules/project-backend-jobs-messaging.md', `# 项目后端任务与消息规则

${metadata('state')}

## 已确认目录

${sourceFact('dir.jobs', '任务 / worker 目录')}
${sourceFact('dir.services', 'Service / use case 目录')}

## 异步策略

${sourceFact('policy.jobsMessaging', '任务、队列、重试、死信和补偿')}
${sourceFact('policy.asyncState', '异步一致性和数据阶段')}
${sourceFact('policy.requestLifecycle', '重试、轮询、取消和防重复提交')}
${sourceFact('policy.idempotency', '幂等策略')}
${sourceFact('policy.apiObservability', '日志、可观测性和脱敏')}

任务和消息必须说明触发来源、payload、幂等键、超时、重试、死信、补偿和最终状态；不得把“任务已提交”写成“业务已完成”。`)

    write('.agent-rules/project-backend-observability.md', `# 项目后端可观测性规则

${metadata('testingGit')}

## 可用命令

${commandLines}

## 观测与验证策略

${sourceFact('policy.apiObservability', 'API 日志、可观测性和脱敏')}
${sourceFact('policy.auditLogging', '审计日志范围')}
${sourceFact('policy.testStrategy', '自动化测试')}
${sourceFact('policy.highRiskGate', '高风险门禁')}
${sourceFact('policy.manualRegression', '手动回归和环境不可用记录')}
${sourceFact('policy.testBoundaries', '边界场景与剩余风险')}

后端交付说明应记录执行过的接口/任务/数据库/消息验证、未覆盖的环境依赖和剩余风险；日志、指标和链路追踪不得包含敏感数据或高基数字段。`)
  }

  write('.agent-rules/project-state-data-flow.md', `# 项目状态与数据流规则

${metadata('state')}

${sourceFact('state.library', '状态管理')}
${sourceFact('state.directory', '状态目录')}
${sourceFact('auth.storage', '当前认证持久化')}
${sourceFact('policy.globalStateBoundary', '全局状态边界')}
${sourceFact('policy.serverAuthority', '服务端权威数据')}
${sourceFact('policy.persistence', '持久化策略')}
${sourceFact('policy.stateTransformation', '数据转换与派生状态')}
${sourceFact('policy.crossPageData', '跨页面数据与 URL 边界')}
${sourceFact('policy.asyncState', '异步一致性与数据阶段')}

异步一致性问题先检查现有调用链和状态模块；只有新增业务语义、事实冲突或不可恢复选择时询问。`)

  write('.agent-rules/project-security-performance.md', `# 项目安全与性能规则

${metadata('security')}

${sourceFact('auth.storage', '凭证存储')}
${sourceFact('auth.tokenKey', 'token key')}
${sourceFact('auth.guardEntry', '认证 / 路由守卫')}
${sourceFact('policy.sensitiveFields', '敏感字段')}
${sourceFact('policy.credentialLifecycle', '凭证和会话生命周期')}
${sourceFact('policy.dataExposure', '敏感信息暴露限制')}
${sourceFact('policy.permissionBoundary', '权限边界')}
${sourceFact('policy.pathAndExternalUrl', '路径、资源与外部 URL')}
${sourceFact('policy.dynamicContent', '上传和动态内容')}
${sourceFact('policy.performancePaths', '关键性能路径')}
${sourceFact('policy.performanceBudget', '性能预算和大资源')}
${sourceFact('policy.cacheAndConcurrency', '并发、缓存和降级')}

认证、权限和缓存变更必须同时检查 API、状态和安全规则。客户端权限不能替代服务端鉴权。`)

  write('.agent-rules/project-testing-quality-gates.md', `# 项目测试与质量门禁规则

${metadata('testingGit')}

## 已有测试

${testFiles.length ? testFiles.map(file => `- \`${file}\``).join('\n') : '- 未检测到测试文件。'}

## 可用命令

${commandLines}

## 策略

${sourceFact('policy.testStrategy', '自动化测试')}
${sourceFact('policy.highRiskGate', '高风险门禁')}
${sourceFact('policy.coreFlows', '核心链路')}
${sourceFact('policy.manualRegression', '手动回归')}
${sourceFact('policy.testBoundaries', '边界场景与剩余风险')}

不得把带 \`--fix\` / \`--write\` 的命令描述为纯验证。自动执行前必须同时检查源码、产物、缓存和长期运行副作用；项目不存在只读 lint 命令时，应明确记录，不得伪造命令。`)

  write('.agent-rules/project-git-delivery.md', `# 项目 Git 与交付规则

${metadata('testingGit')}
${gitUnavailableNote}

${sourceFact('git.repository', 'Git 仓库状态')}
${sourceFact('git.currentBranch', '当前分支')}
${sourceFact('git.branches', '本地分支')}
${sourceFact('git.defaultBranchCandidate', '默认分支候选')}
${sourceFact('git.protectedBranches', '受保护分支')}
${sourceFact('policy.branchNaming', '分支命名')}
${sourceFact('policy.commitStyle', '提交信息')}
${sourceFact('policy.wipCommits', 'WIP 与提交整理')}
${sourceFact('policy.releaseBoundary', 'PR、CI、发布和推送边界')}
${sourceFact('policy.gitSafety', 'Git 安全边界')}

${factValue('git.repository', true) === false ? '当前目录不是 Git 仓库；执行分支、提交、tag、推送等 Git 操作前必须先确认仓库上下文。' : '当前分支不等于受保护分支。无法从远端 HEAD 或仓库策略确认受保护分支时，必须询问用户。'}`)

  write('.agent-rules/project-business-rules.md', `# 项目业务规则

${metadata('business')}

${sourceFact('business.rulesDocument', '业务规则文档')}
${sourceFact('policy.businessRuleSource', '业务规则来源')}
${sourceFact('policy.highRiskDomains', '高风险业务域')}
${sourceFact('policy.businessEnums', '状态、枚举和权限码来源')}

仓库结构只能证明业务入口位置，不能证明金额、状态流转、审核、支付、订单等业务语义。`)

  write('.agent-rules/project-domain-map.md', `# 项目业务域地图

${metadata('business')}

## 页面域

${domains.domains && domains.domains.length ? domains.domains.map(domain => `- ${domain.name}：\`${domain.pageRoot}\``).join('\n') : '- 未检测到页面业务域。'}

## 路由入口

${domains.routePaths && domains.routePaths.length ? domains.routePaths.map(route => `- \`${route}\``).join('\n') : '- 未检测到路由入口。'}

## API 文件

${domains.apiFiles && domains.apiFiles.length ? domains.apiFiles.map(file => `- \`${file}\``).join('\n') : '- 未检测到 API 文件。'}

本文件记录代码定位事实，不替代业务规则文档。`)
}

function renderFacts() {
  const modules = Object.fromEntries(Object.keys(MODULES).map(module => [module, moduleStatus(module)]))
  const artifacts = Object.fromEntries(GENERATED_ARTIFACTS.filter(exists).map(relative => [relative, hashFile(path.join(ROOT, relative))]))
  write('.agent-rules/project-facts.json', JSON.stringify({
    schemaVersion: 2,
    generatorVersion: PACKAGE.version,
    coverageCatalogVersion: 1,
    generatedAt: NOW.toISOString(),
    staleAfterDays: 30,
    projectRoot: '.',
    projectScope: projectScope(),
    sharedTemplates: selectedSharedTemplates(),
    modules,
    facts: facts.sort((a, b) => a.id.localeCompare(b.id)),
    answers,
    artifacts
  }, null, 2))
}

function backupExisting() {
  if (fs.existsSync(RULE_DIR)) copyDirectory(RULE_DIR, path.join(ROOT, `.agent-rules.backup-${TIMESTAMP}`))
  if (fs.existsSync(path.join(ROOT, 'AGENTS.md'))) fs.copyFileSync(path.join(ROOT, 'AGENTS.md'), path.join(ROOT, `AGENTS.md.backup-${TIMESTAMP}`))
}

function cleanupGenerated() {
  for (const relative of GENERATED_ARTIFACTS) {
    const full = path.join(ROOT, relative)
    if (fs.existsSync(full)) fs.unlinkSync(full)
  }
  if (fs.existsSync(RULE_DIR)) {
    for (const file of fs.readdirSync(RULE_DIR).filter(file => file.startsWith('shared-') && file.endsWith('.md'))) {
      fs.unlinkSync(path.join(RULE_DIR, file))
    }
  }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function calculateManifestModule(module, manifest) {
  const stored = manifest.modules && manifest.modules[module]
  if (stored && stored.status === 'ignored') return { status: 'ignored', missing: [], coverage: [], dimensions: { strategy: 'ignored', repositoryFacts: 'ignored', businessContracts: 'ignored' } }
  const factMap = new Map((manifest.facts || []).map(item => [item.id, item]))
  const coverage = (COVERAGE_CATALOG[module] || []).map(([id, label, factIds]) => {
    const missingFacts = factIds.filter(factId => {
      const item = factMap.get(factId)
      return !item || !['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
    })
    return { id, label, factIds, status: missingFacts.length ? 'missing' : 'covered', missingFacts }
  })
  const missing = coverage.filter(item => item.status === 'missing').map(item => item.id)
  const strategyCoverage = coverage.filter(item => item.factIds.some(id => id.startsWith('policy.')))
  const strategy = strategyCoverage.length ? (strategyCoverage.some(item => item.status === 'missing') ? 'partial' : 'configured') : 'not-applicable'
  const repositoryFacts = (manifest.facts || []).filter(item => item.module === module && item.source !== 'wizard')
  const repositoryStatus = !repositoryFacts.length ? 'not-found' : repositoryFacts.every(item => item.status === 'confirmed') ? 'confirmed' : 'partial'
  const contractIds = BUSINESS_CONTRACT_FACTS[module] || []
  const businessContracts = !contractIds.length ? 'not-applicable' : contractIds.every(id => {
    const item = factMap.get(id)
    return item && ['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
  }) ? 'confirmed' : 'partial'
  return { status: missing.length ? 'partial' : 'configured', missing, coverage, dimensions: { strategy, repositoryFacts: repositoryStatus, businessContracts } }
}

function verify() {
  const factsFile = path.join(RULE_DIR, 'project-facts.json')
  if (!fs.existsSync(factsFile)) throw new Error('缺少 .agent-rules/project-facts.json，请重新运行初始化器。')
  const manifest = JSON.parse(fs.readFileSync(factsFile, 'utf8'))
  const errors = []
  const warnings = []
  const validStatuses = new Set(['confirmed', 'user-confirmed', 'inferred', 'undefined', 'not-applicable'])

  if (manifest.schemaVersion !== 2) errors.push(`不支持的 facts schemaVersion：${manifest.schemaVersion}`)
  if (!manifest.generatorVersion || !manifest.generatedAt || !Array.isArray(manifest.facts) || !manifest.modules || !manifest.artifacts) errors.push('project-facts.json 缺少必需字段。')
  const seenIds = new Set()
  for (const item of manifest.facts || []) {
    if (!item.id || !item.module || item.value === undefined || !item.status || !item.source || !item.verifiedAt) errors.push(`fact 结构不完整：${item.id || '<unknown>'}`)
    if (seenIds.has(item.id)) errors.push(`存在重复 fact ID：${item.id}`)
    seenIds.add(item.id)
    if (!validStatuses.has(item.status)) errors.push(`fact 状态非法：${item.id} -> ${item.status}`)
  }
  const scopeFact = (manifest.facts || []).find(item => item.id === 'project.scope')
  const manifestScope = PROJECT_SCOPES[manifest.projectScope] ? manifest.projectScope : scopeFact && PROJECT_SCOPES[scopeFact.value] ? scopeFact.value : ''
  const expectedSharedTemplates = Array.isArray(manifest.sharedTemplates) && manifest.sharedTemplates.length
    ? manifest.sharedTemplates
    : manifestScope
      ? selectedSharedTemplates(manifestScope)
      : fs.readdirSync(RULE_DIR).filter(file => file.startsWith('shared-') && file.endsWith('.md'))
  for (const template of expectedSharedTemplates) {
    const generated = path.join(RULE_DIR, template)
    const source = path.join(SHARED_TEMPLATE_DIR, template)
    if (!fs.existsSync(generated)) errors.push(`缺少 shared 文件：${template}`)
    else if (!fs.existsSync(source)) errors.push(`缺少 shared 模板源文件：${template}`)
    else if (hashFile(generated) !== hashFile(source)) errors.push(`shared 模板发生漂移：${template}`)
  }
  const catalogIds = Object.values(COVERAGE_CATALOG).flat().map(item => item[0]).sort()
  const checklistSource = fs.readFileSync(path.join(SHARED_TEMPLATE_DIR, 'shared-project-requirements-check.md'), 'utf8')
  const checklistIds = [...checklistSource.matchAll(/\[([a-z][\w.]+)\]/g)].map(match => match[1]).sort()
  if (JSON.stringify(catalogIds) !== JSON.stringify(checklistIds)) errors.push('coverage catalog 与 shared-project-requirements-check.md 的 requirement ID 不一致。')
  for (const item of manifest.facts || []) {
    for (const reference of item.evidenceRefs || []) {
      const current = fingerprint(reference.path, reference.kind && reference.kind.endsWith('-exists') ? 'existence' : 'content')
      if (!current) errors.push(`事实来源已不存在：${item.id} -> ${reference.path}`)
      else if (reference.sha256 && current.sha256 !== reference.sha256) errors.push(`事实来源已变化，需要重新生成：${item.id} -> ${reference.path}`)
    }
  }
  const manifestFact = id => (manifest.facts || []).find(item => item.id === id)
  const manifestValue = (id, fallback) => {
    const item = manifestFact(id)
    return item && item.value !== undefined ? item.value : fallback
  }
  const domainFact = manifestFact('domain.map')
  if (domainFact) {
    const currentDomainMap = collectDomainMap(manifestValue('dir.pages', ''), manifestValue('dir.api', ''))
    const comparable = { domains: currentDomainMap.domains, routePaths: currentDomainMap.routePaths, apiFiles: currentDomainMap.apiFiles }
    if (JSON.stringify(comparable) !== JSON.stringify(domainFact.value)) errors.push('业务域结构已变化，需要重新生成：domain.map')
  }
  const testFilesFact = manifestFact('testing.files')
  if (testFilesFact) {
    const currentTestFiles = collectTestFiles(manifestValue('dir.tests', ''))
    if (JSON.stringify(currentTestFiles) !== JSON.stringify(testFilesFact.value)) errors.push('测试文件结构已变化，需要重新生成：testing.files')
  }
  const ageDays = Math.floor((Date.now() - new Date(manifest.generatedAt).getTime()) / 86400000)
  if (ageDays > (manifest.staleAfterDays || 30)) warnings.push(`事实清单已超过 ${manifest.staleAfterDays || 30} 天未核验。`)
  const gitSnapshot = getGitSnapshot()
  const recordedGitRepository = manifestFact('git.repository')
  const currentGitRepository = Boolean(gitSnapshot)
  if (recordedGitRepository && recordedGitRepository.value !== currentGitRepository) errors.push(`Git 仓库状态已变化，需要重新生成：git.repository`)
  if (gitSnapshot) {
    const gitComparisons = [
      ['git.currentBranch', gitSnapshot.current],
      ['git.branches', gitSnapshot.branches],
      ['git.remoteHead', gitSnapshot.remoteHead],
      ['git.branchCandidates', gitSnapshot.branchCandidates],
      ['git.defaultBranchCandidate', gitSnapshot.defaultCandidate]
    ]
    for (const [id, currentValue] of gitComparisons) {
      const recorded = manifestFact(id)
      if (!recorded && currentValue && (!Array.isArray(currentValue) || currentValue.length)) errors.push(`发现新的 Git 事实，需要重新生成：${id}`)
      else if (recorded && JSON.stringify(recorded.value) !== JSON.stringify(currentValue)) errors.push(`Git 事实已变化，需要重新生成：${id}`)
    }
  }
  const index = read('.agent-rules/project-index.md')
  for (const module of Object.keys(MODULES)) {
    const state = manifest.modules && manifest.modules[module]
    if (!state) {
      errors.push(`facts 缺少模块状态：${module}`)
      continue
    }
    const calculated = calculateManifestModule(module, manifest)
    if (state.status !== calculated.status || JSON.stringify((state.missing || []).slice().sort()) !== JSON.stringify(calculated.missing.slice().sort()) || JSON.stringify(state.dimensions || {}) !== JSON.stringify(calculated.dimensions || {})) errors.push(`模块 coverage 或状态维度计算不一致：${module}`)
    const storedCoverageIds = (state.coverage || []).map(item => item.id).sort()
    const catalogCoverageIds = (COVERAGE_CATALOG[module] || []).map(item => item[0]).sort()
    if (state.status !== 'ignored' && JSON.stringify(storedCoverageIds) !== JSON.stringify(catalogCoverageIds)) errors.push(`模块 coverage catalog 不完整：${module}`)
    const expected = `- ${MODULES[module]}：${coverageLabel(state.status)}`
    if (!index.includes(expected)) errors.push(`模块状态漂移：project-index.md 未包含“${expected}”`)
    if (state.status === 'partial') warnings.push(`${MODULES[module]}仍为部分配置：${(state.missing || []).join('、')}`)
  }
  for (const [relative, expectedHash] of Object.entries(manifest.artifacts || {})) {
    const full = path.join(ROOT, relative)
    if (!fs.existsSync(full)) errors.push(`生成产物缺失：${relative}`)
    else if (hashFile(full) !== expectedHash) errors.push(`生成产物已漂移：${relative}；人工规则应写入 project-custom.md`)
  }
  const implementationGaps = manifestFact('api.implementationGaps')
  if (implementationGaps && Array.isArray(implementationGaps.value)) {
    implementationGaps.value.forEach(gap => warnings.push(`API 实现差距：${gap}`))
  }
  if (!exists('.agent-rules/project-custom.md')) warnings.push('缺少 project-custom.md，人工规则没有稳定保留位置。')

  note('规则校验结果')
  errors.forEach(item => process.stdout.write(`错误：${item}\n`))
  warnings.forEach(item => process.stdout.write(`警告：${item}\n`))
  if (!errors.length && !warnings.length) process.stdout.write('通过：schema、coverage、shared、事实来源、生成产物和有效期均正常。\n')
  else if (!errors.length) process.stdout.write('校验完成：无结构错误，但仍有需要处理的警告。\n')
  if (errors.length) process.exitCode = 1
  else if (STRICT && warnings.length) process.exitCode = 2
}

async function main() {
  if (SHOW_HELP) {
    process.stdout.write(`${PACKAGE.name} v${PACKAGE.version}\n\n用法：\n  ${COMMAND} [--root <项目目录>]\n  ${COMMAND} --verify [--strict] [--root <项目目录>]\n\n选项：\n  --root       指定目标项目，默认当前目录\n  --verify     检查 schema、coverage、模板、事实来源、产物和过期时间\n  --strict     verify 出现 partial、undefined、过期或其他警告时返回退出码 2\n  --defaults   使用推荐默认值生成，所有未人工确认策略标记为 inferred\n  --help       显示帮助\n`)
    return
  }
  if (!fs.existsSync(ROOT)) throw new Error(`项目目录不存在：${ROOT}`)
  if (VERIFY_ONLY) return verify()

  note('AI 项目规则脚手架')
  process.stdout.write(`项目目录：${ROOT}\n`)
  warn('shared 规则来自固定模板；project 规则由可追溯事实和用户策略生成。')
  if (!NON_INTERACTIVE) {
    makeReadline()
    if (!(await askYesNo('是否继续？', true))) {
      rl.close()
      return
    }
  }

  scanAll()
  note('自动扫描摘要')
  process.stdout.write(`${facts.map(item => `- ${item.id}: ${markdownValue(item.value)}（${item.status}）`).join('\n')}\n`)
  await collectAnswers()
  if (rl) rl.close()

  note('模块覆盖状态')
  process.stdout.write(`${renderStatusLines(Object.keys(MODULES))}\n`)
  if (!NON_INTERACTIVE) {
    makeReadline()
    if (!(await askYesNo('确认备份现有规则并生成？', true))) {
      rl.close()
      return
    }
    rl.close()
  }

  backupExisting()
  fs.mkdirSync(RULE_DIR, { recursive: true })
  cleanupGenerated()
  copyShared()
  ensureCustomRules()
  renderAgents()
  renderIndex()
  renderSummary()
  renderProjectRules()
  renderFacts()

  note('完成')
  process.stdout.write(`已生成规则。摘要：${path.join(RULE_DIR, 'project-summary.md')}\n`)
  verify()
}

main().catch(error => {
  process.stderr.write(`错误：${error.message}\n`)
  process.exitCode = 1
})
