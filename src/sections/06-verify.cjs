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
