const readline = require('readline')
const path = require('path')
const {
  ROOT, NON_INTERACTIVE, VERIFIED_AT, EXISTING_MANIFEST, MODULES,
  facts, answers, moduleChoices, ui,
  note, exists, addFact, fact, factValue, previousValue, markdownValue
} = require('./context.cjs')
const { projectScope } = require('./render.cjs')
const { inferProjectScope } = require('./scan.cjs')

function makeReadline() {
  ui.rl = readline.createInterface({ input: process.stdin, output: process.stdout })
}

function question(prompt) {
  if (NON_INTERACTIVE) return Promise.resolve('')
  return new Promise(resolve => ui.rl.question(prompt, answer => resolve(answer.trim())))
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

module.exports = {
  makeReadline, question, askText, askYesNo, askChoice, recordAnswer,
  evidenceLabel, evidenceLabels, moduleFindings, configureModule,
  commandSummary, collectAnswers
}
