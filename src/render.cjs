const fs = require('fs')
const path = require('path')
const {
  PACKAGE, COMMAND, SHARED_TEMPLATE_DIR, ROOT, RULE_DIR, NOW, VERIFIED_AT, TIMESTAMP,
  GENERATED_ARTIFACTS, SEMANTICS_FILE, MODULES, PROJECT_SCOPES,
  COMMON_SHARED_TEMPLATES, FRONTEND_SHARED_TEMPLATES, BACKEND_SHARED_TEMPLATES,
  COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS,
  facts, answers, moduleChoices,
  exists, fact, factValue, markdownValue, listFiles, hashFile
} = require('./context.cjs')

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

function ensureSemanticsStore() {
  if (exists(SEMANTICS_FILE)) return
  write(SEMANTICS_FILE, `${JSON.stringify({
    schemaVersion: 1,
    description: '语义层：记录代码无法自证的业务语义（状态、枚举、金额、权限、流转等）。由 AI 在修 bug、改需求、加模块时增量补全；高风险语义必须人工确认（status=user-confirmed）。生成器不会覆盖本文件。',
    updatedAt: NOW.toISOString(),
    entries: []
  }, null, 2)}\n`)
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
    '- 业务：`project-business-rules.md`、`project-domain-map.md`、`project-semantics.json` 及权威业务文档。',
    '- 业务语义（状态、枚举、金额、权限、流转）：按 `semantic-workflow.md` 执行——先查 `project-semantics.json` 对应域条目，缺失或过期时按任务实际业务整理后写回，高风险语义须人工确认（status=user-confirmed）再据此实现。',
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

## 5. 必须确认的高风险缺口

- 涉及业务语义、业务规则、状态流转、金额、权限、审核、支付、订单、删除、禁用、导出等高风险行为时，若 \`project-*\`、\`project-custom.md\`、权威业务文档或接口契约没有明确说明，必须先向用户确认；不得根据字段名、页面文案、代码现状或模型常识自行推断。
- 涉及数据契约、字段含义、默认值、枚举映射、类型转换、单位、时区、金额精度和空值语义时，缺少明确契约必须确认，不得自行补语义。
- 涉及认证、授权、租户/组织/账号隔离、敏感信息、审计日志和密钥配置时，缺少项目安全规则必须确认，不得降低既有安全边界。
- 涉及数据库 schema、迁移、回填、删除字段/索引、事务边界、缓存失效、队列重放和外部副作用时，缺少回滚、补偿或幂等说明必须确认。
- 涉及发布、推送、打 tag、删除分支、重写历史、强制推送、清空工作区和生产环境操作时，必须获得用户明确授权。

## 6. 模块状态

${renderStatusLines(Object.keys(MODULES))}

## 7. 事实有效性

- 事实清单：\`project-facts.json\`。
- 最后核验：${VERIFIED_AT}。
- 使用 \`${COMMAND} --verify\` 检查模板漂移、来源缺失和事实过期。

## 8. 默认输出语言

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

function renderSemanticWorkflow() {
  write('.agent-rules/semantic-workflow.md', `# 语义层增量补全工作流（agent 通用）

本文件是与具体工具无关的过程规范，适用于 Claude Code、Codex、Cursor 等任何读取 \`AGENTS.md\` / 规则文件的 agent。语义层（\`project-semantics.json\`）不一次性补全，而是在每次实际开发时，由 agent 就地整理并写回涉及到的业务语义，逐步收敛。

## 何时执行

修复 bug、调整需求或新增业务模块时，只要改动涉及业务语义（状态流转、枚举、金额、权限、审核、支付、订单等代码无法自证的含义），在动手实现前执行本流程。纯结构性、无业务语义的改动可跳过。

## 步骤

1. **定位影响面**：读 \`project-domain-map.md\`，根据任务找到涉及的域及其关联文件（feature、页面、API）。影响面由目录命名和源码 \`import\` 片段推断，可能漏报（alias 路径、barrel 导出、统一 request 封装）或误报，仅作导航起点，必须结合实际代码核对，不得作为"无需再查"的依据。
2. **查已有语义**：读 \`project-semantics.json\`，筛出 \`domain\` 命中的条目。
   - 命中且 \`status=user-confirmed\` 且来源未漂移：直接据此实现。
   - 缺失、为 \`inferred\`、或被 \`--verify\` 标记来源已变化：进入第 3 步。
3. **就地整理语义**：基于当前任务掌握的真实业务（真实数据流、接口返回、用户/需求确认的结论），整理出该域缺失的语义，按下方 schema 追加或更新到 \`entries\`。
   - 来自代码/接口的观察但未经人确认：\`status=inferred\`，\`recordedBy=ai\`。
   - 已由用户或权威文档确认：\`status=user-confirmed\`。
   - 每条都要带 \`evidenceRefs\`，指向支撑该语义的真实文件。
4. **高风险必须确认**：涉及金额、权限、状态流转、审核、支付、订单、退款、删除、禁用等的语义，未经用户明确确认不得标 \`user-confirmed\`，也不得据未确认的推断直接实现高风险逻辑——先向用户确认。
5. **自检**：运行 \`${COMMAND} --verify\`，确保无语义结构错误；处理"高风险未确认""来源已变化"等警告。
6. **再实现**：以确认后的语义为准完成代码改动。

## 语义条目 schema（\`project-semantics.json\` 的 \`entries[]\`）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| \`id\` | 是 | 全局唯一，建议 \`<域>.<主题>\`，如 \`facility-payment.order-status\` |
| \`domain\` | 是 | 关联的业务域，应出现在 \`project-domain-map.md\` |
| \`statement\` | 是 | 语义本身，写清取值/约束/流转 |
| \`status\` | 是 | \`inferred\`（候选）或 \`user-confirmed\`（已确认）|
| \`verifiedAt\` | 是 | 核验日期 \`YYYY-MM-DD\` |
| \`risk\` | 否 | 风险标签数组，如 \`["金额","状态"]\`，命中高风险词时触发确认闸门 |
| \`recordedBy\` | 否 | \`ai\` 或 \`human\` |
| \`evidenceRefs\` | 否（强烈建议）| \`[{ "path": "...", "sha256": "..." }]\`，来源文件变化时自动标记需复核 |
| \`title\` / \`sourceTask\` / \`supersedes\` | 否 | 标题、产生该语义的任务、被取代的旧条目 id |

\`project-semantics.json\` 由维护者和 agent 增量维护，生成器不会覆盖；除该文件外的语义判断不得绕过本流程直接写入其他规则文件。

## 各 agent 接入

- 任何读取 \`AGENTS.md → project-index.md\` 的 agent：通过索引"业务语义"路由自动进入本流程，无需额外配置。
- 需要显式触发器的 agent（如 Claude skill、Cursor rule）：用一个仅指向本文件的薄适配器，不复制流程正文，保持本文件为唯一事实源。`)
}

function renderProjectRules() {
  const commands = factValue('testing.commands', [])
  const testFiles = factValue('testing.files', [])
  const domains = factValue('domain.map', { domains: [], routePaths: [], apiFiles: [], impact: [], sharedAssets: [] })
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
> 来源：按 \`import\` 引用统计的跨域共享资产；仅证明被多个域使用，复用前仍需确认语义契合。

${(() => {
  const shared = domains.sharedAssets || []
  if (!shared.length) return '暂无被多个域复用的资产。新增业务判断、映射、校验、流程或 UI 结构前，仍应先查本文件与代码资产索引，发现重复时记录位置、语义和暂不抽象原因。'
  const label = { component: '组件', api: 'API', store: '状态' }
  const lines = shared.map(asset => `- \`${asset.path}\`（${label[asset.kind] || asset.kind}，被 ${asset.usedBy.length} 个域使用：${asset.usedBy.join('、')}）`)
  return `以下资产已被多个域复用，新增同类能力前应优先复用，不要重造：\n\n${lines.join('\n')}`
})()}`)

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

仓库结构只能证明业务入口位置，不能证明金额、状态流转、审核、支付、订单等业务语义。

涉及业务语义、业务规则、状态流转、金额、权限、审核、支付、订单、删除、禁用、导出等高风险行为时，若 \`project-*\`、\`project-custom.md\`、权威业务文档或接口契约没有明确说明，必须先向用户确认；不得根据字段名、页面文案、代码现状或模型常识自行推断。`)

  write('.agent-rules/project-domain-map.md', `# 项目业务域地图

${metadata('business')}

## 业务域（features）

${(() => {
  const features = (domains.domains || []).filter(domain => domain.kind === 'feature')
  return features.length ? features.map(domain => `- ${domain.name}：\`${domain.root}\``).join('\n') : '- 未检测到独立业务域目录。'
})()}

## 页面域

${(() => {
  const pages = (domains.domains || []).filter(domain => domain.kind === 'page' || !domain.kind)
  return pages.length ? pages.map(domain => `- ${domain.name}：\`${domain.root || domain.pageRoot}\``).join('\n') : '- 未检测到页面业务域。'
})()}

## 域关联（影响面）

> 按目录命名和 \`import\` 引用聚合，仅证明文件位置关联，不证明业务语义。修改某个域时应一并核对其关联文件。

${(() => {
  const impact = domains.impact || []
  if (!impact.length) return '- 未检测到跨 feature / 页面 / API 的结构关联。'
  return impact.map(group => {
    const lines = [`- ${group.name}`]
    if (group.feature) lines.push(`  - feature：\`${group.feature}\``)
    if (group.pages && group.pages.length) lines.push(`  - 页面：${group.pages.map(file => `\`${file}\``).join('、')}`)
    if (group.apis && group.apis.length) lines.push(`  - API：${group.apis.map(file => `\`${file}\``).join('、')}`)
    if (group.stores && group.stores.length) lines.push(`  - 状态：${group.stores.map(file => `\`${file}\``).join('、')}`)
    if (group.components && group.components.length) lines.push(`  - 组件：${group.components.map(file => `\`${file}\``).join('、')}`)
    return lines.join('\n')
  }).join('\n')
})()}

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

module.exports = {
  moduleStatus, statusLabel, coverageLabel, dimensionLabel, metadata, sourceFact,
  write, copyDirectory, copyShared, projectScope, selectedSharedTemplates,
  sharedTemplateExists, renderStatusLines, renderAgents, ensureCustomRules,
  ensureSemanticsStore, renderIndex, renderSummary, renderSemanticWorkflow,
  renderProjectRules, renderFacts, backupExisting, cleanupGenerated
}
