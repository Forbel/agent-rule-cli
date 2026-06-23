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
