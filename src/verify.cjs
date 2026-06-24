const fs = require('fs')
const path = require('path')
const {
  SHARED_TEMPLATE_DIR, ROOT, RULE_DIR, STRICT, SEMANTICS_FILE, SEMANTIC_STATUSES,
  HIGH_RISK_SEMANTICS, MODULES, PROJECT_SCOPES, SCOPE_CRITICAL_DIRS, COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS,
  facts, note, exists, read, fingerprint, fact, hashFile
} = require('./context.cjs')
const { collectDomainMap, collectTestFiles, getGitSnapshot } = require('./scan.cjs')
const { coverageLabel, selectedSharedTemplates, projectScope } = require('./render.cjs')

const { calculateManifestModule: calculateManifestModuleCore } = require('./verify-core.cjs')

function calculateManifestModule(module, manifest) {
  return calculateManifestModuleCore(module, manifest, { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS })
}

function verifySemantics(manifest) {
  const errors = []
  const warnings = []
  if (!exists(SEMANTICS_FILE)) {
    warnings.push('缺少 project-semantics.json，语义层没有稳定保留位置。')
    return { errors, warnings }
  }
  let store
  try {
    store = JSON.parse(read(SEMANTICS_FILE))
  } catch {
    errors.push('project-semantics.json 不是合法 JSON。')
    return { errors, warnings }
  }
  if (store.schemaVersion !== 1) errors.push(`不支持的 semantics schemaVersion：${store.schemaVersion}`)
  if (!Array.isArray(store.entries)) {
    errors.push('project-semantics.json 缺少 entries 数组。')
    return { errors, warnings }
  }
  const domainFact = (manifest.facts || []).find(item => item.id === 'domain.map')
  const knownDomains = new Set()
  if (domainFact && domainFact.value) {
    for (const domain of domainFact.value.domains || []) knownDomains.add(domain.name)
    for (const group of domainFact.value.impact || []) knownDomains.add(group.name)
  }
  const seen = new Set()
  for (const entry of store.entries) {
    const label = entry && entry.id ? entry.id : '<unknown>'
    if (!entry || !entry.id || !entry.domain || !entry.statement || !entry.status || !entry.verifiedAt) {
      errors.push(`语义条目结构不完整：${label}`)
      continue
    }
    if (seen.has(entry.id)) errors.push(`存在重复语义 ID：${entry.id}`)
    seen.add(entry.id)
    if (typeof entry.id !== 'string' || typeof entry.domain !== 'string' || typeof entry.statement !== 'string') errors.push(`语义字段类型非法（id/domain/statement 必须是字符串）：${entry.id}`)
    if (!SEMANTIC_STATUSES.has(entry.status)) errors.push(`语义状态非法：${entry.id} -> ${entry.status}（仅允许 inferred / user-confirmed）`)
    if (typeof entry.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt)) errors.push(`语义 verifiedAt 必须是 YYYY-MM-DD：${entry.id} -> ${entry.verifiedAt}`)
    if (entry.recordedBy !== undefined && !['ai', 'human'].includes(entry.recordedBy)) errors.push(`语义 recordedBy 非法：${entry.id} -> ${entry.recordedBy}`)
    let riskTags = []
    if (entry.risk !== undefined) {
      if (!Array.isArray(entry.risk)) errors.push(`语义 risk 必须是数组：${entry.id}`)
      else if (!entry.risk.every(tag => typeof tag === 'string')) errors.push(`语义 risk 数组元素必须是字符串：${entry.id}`)
      else riskTags = entry.risk
    }
    if (knownDomains.size && typeof entry.domain === 'string' && !knownDomains.has(entry.domain)) warnings.push(`语义关联的域不在业务域地图中：${entry.id} -> ${entry.domain}`)
    const highRisk = riskTags.some(tag => HIGH_RISK_SEMANTICS.some(keyword => tag.includes(keyword)))
    if (highRisk && entry.status !== 'user-confirmed') warnings.push(`高风险语义尚未人工确认：${entry.id}`)
    if (entry.evidenceRefs !== undefined && !Array.isArray(entry.evidenceRefs)) {
      errors.push(`语义 evidenceRefs 必须是数组：${entry.id}`)
      continue
    }
    for (const reference of entry.evidenceRefs || []) {
      if (!reference || typeof reference.path !== 'string') {
        errors.push(`语义 evidenceRefs 条目必须包含字符串 path：${entry.id}`)
        continue
      }
      if (reference.sha256 !== undefined && typeof reference.sha256 !== 'string') {
        errors.push(`语义 evidenceRefs 的 sha256 必须是字符串：${entry.id} -> ${reference.path}`)
        continue
      }
      const current = fingerprint(reference.path, 'content')
      if (!current) warnings.push(`语义来源已不存在，需要复核：${entry.id} -> ${reference.path}`)
      else if (reference.sha256 && current.sha256 !== reference.sha256) warnings.push(`语义来源已变化，需要复核：${entry.id} -> ${reference.path}`)
    }
  }
  return { errors, warnings }
}

function verify() {
  const factsFile = path.join(RULE_DIR, 'project-facts.json')
  if (!fs.existsSync(factsFile)) throw new Error('缺少 .agent-rules/project-facts.json，请重新运行初始化器。')
  const manifest = JSON.parse(fs.readFileSync(factsFile, 'utf8'))
  const errors = []
  const warnings = []
  const validStatuses = new Set(['confirmed', 'user-confirmed', 'inferred', 'undefined', 'not-applicable', 'needs-confirmation'])

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
  if (domainFact && domainFact.source !== 'ai-enrichment') {
    const currentDomainMap = collectDomainMap(manifestValue('dir.pages', ''), manifestValue('dir.api', ''), manifestValue('dir.features', ''), manifestValue('dir.state', ''), manifestValue('dir.components', ''))
    const comparable = { domains: currentDomainMap.domains, routePaths: currentDomainMap.routePaths, apiFiles: currentDomainMap.apiFiles, impact: currentDomainMap.impact, sharedAssets: currentDomainMap.sharedAssets }
    if (JSON.stringify(comparable) !== JSON.stringify(domainFact.value)) errors.push('业务域结构已变化，需要重新生成：domain.map')
  }
  const testFilesFact = manifestFact('testing.files')
  if (testFilesFact) {
    const currentTestFiles = collectTestFiles(manifestValue('dir.tests', ''))
    if (JSON.stringify(currentTestFiles) !== JSON.stringify(testFilesFact.value)) errors.push('测试文件结构已变化，需要重新生成：testing.files')
  }
  const ageDays = Math.floor((Date.now() - new Date(manifest.generatedAt).getTime()) / 86400000)
  if (ageDays > (manifest.staleAfterDays || 30)) warnings.push(`事实清单已超过 ${manifest.staleAfterDays || 30} 天未核验。`)
  for (const [id, label] of SCOPE_CRITICAL_DIRS[manifestScope] || []) {
    const answer = manifest.answers && manifest.answers[id]
    const addressed = manifestFact(id) || (answer && ['user-confirmed', 'not-applicable'].includes(answer.status))
    if (!addressed) warnings.push(`未识别到${label}，相关页面/路由/API 或后端规则可能为空；可重新运行并在“目录补充”填写实际路径。`)
  }
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
  const semantics = verifySemantics(manifest)
  errors.push(...semantics.errors)
  warnings.push(...semantics.warnings)

  note('规则校验结果')
  errors.forEach(item => process.stdout.write(`错误：${item}\n`))
  warnings.forEach(item => process.stdout.write(`警告：${item}\n`))
  if (!errors.length && !warnings.length) process.stdout.write('通过：schema、coverage、shared、事实来源、生成产物和有效期均正常。\n')
  else if (!errors.length) process.stdout.write('校验完成：无结构错误，但仍有需要处理的警告。\n')
  if (errors.length) process.exitCode = 1
  else if (STRICT && warnings.length) process.exitCode = 2
}

module.exports = { calculateManifestModule, verifySemantics, verify }
