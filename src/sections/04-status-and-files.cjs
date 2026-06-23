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
