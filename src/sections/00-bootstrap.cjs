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
