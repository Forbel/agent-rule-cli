# 项目规则适配检查

本文件用于检查 shared 通用规则依赖的 project 级答案是否已补齐，不记录当前项目答案。方括号中的 requirement ID 必须与生成器 coverage catalog 一致。

## 执行要求

- 已覆盖：所需事实均为 `confirmed`、`user-confirmed` 或 `not-applicable`。
- 部分覆盖：至少一项为 `inferred`、`undefined` 或缺失。
- 已忽略：用户明确跳过模块。

## 1. 架构与目录

- [architecture.identity] 项目身份、业务描述、类型、侧重和技术栈。
- [architecture.directories] 页面、服务、共享、API、状态和资源目录边界。
- [architecture.newDirectories] 新增目录与模块边界。
- [architecture.language] 默认输出和文档语言。

## 2. 代码质量

- [code.dataContract] 数据契约、新模块和存量治理策略。
- [code.modelPlacement] 类型、模型、mapper、normalizer、adapter 位置。
- [code.indexMaintenance] 代码资产、复用候选和业务域地图维护。
- [code.encapsulation] 页面/入口私有、领域共享和项目共享边界。
- [code.crossProject] 跨项目包和共享库策略。
- [code.documentation] 注释、临时方案和复杂业务规则文档化。

## 3. UI

- [ui.stack] 组件库、主题、样式和输入来源。
- [ui.components] 组件目录、资产清单和共享准入。
- [ui.layoutFeedback] 布局、浮层、加载和交互反馈。
- [ui.forms] 表单、破坏性操作和失败保留。
- [ui.presentation] 文案、响应式、可访问性、视觉变量、图标和验收。

## 4. API 与错误处理

- [api.entryConfig] 统一请求入口、API 目录和基础请求配置。
- [api.errorModel] 错误对象、错误分类和状态码类型。
- [api.displayCatch] 默认展示和 catch 职责。
- [api.silentCustom] 静默请求、自定义错误和后置回调。
- [api.auth] 认证失效、权限不足、清理和并发保护。
- [api.lifecycle] 重试、轮询、取消、过期响应和防重复提交。
- [api.logging] 错误日志、可观测性和脱敏。

## 5. 状态与数据流

- [state.solution] 状态管理方案和作用域边界。
- [state.authority] 唯一事实源和服务端权威数据。
- [state.transform] 接口转换、派生数据和枚举标准化。
- [state.persistence] 持久化、版本、失效、清理和账号隔离。
- [state.transfer] 跨页面/跨服务/跨任务传递和 URL 参数边界。
- [state.asyncUi] 异步一致性和 UI 数据阶段。

## 6. 安全与性能

- [security.credentials] 凭证、会话、清理和敏感字段。
- [security.exposure] URL、日志、错误、埋点、截图和提交记录限制。
- [security.permissions] 权限入口和前后端权限边界。
- [security.paths] 部署路径、资源前缀、外链、下载和回调校验。
- [security.dynamicContent] 上传、富文本、Markdown、动态 HTML 和预览。
- [security.performance] 关键路径、性能预算、列表和大资源。
- [security.cacheConcurrency] 并发、轮询、高频事件、缓存和降级。

## 7. 测试、Git 与交付

- [git.repository] Git 仓库状态。
- [git.protected] 受保护分支和禁止直接提交范围。
- [git.branches] 需求、修复、重构和实验分支命名。
- [git.commits] 提交格式、语言、WIP 和整理。
- [git.delivery] PR、CI、发布、tag 和推送边界。
- [git.safety] 禁止提交文件和高风险 Git 授权。
- [testing.strategy] 单元、集成、E2E、lint、类型和构建策略。
- [testing.risk] 风险分级和最小验证范围。
- [testing.flows] 核心业务链路和必须更新测试的场景。
- [testing.manual] 手动回归、UI/API/任务验证和环境不可用处理。
- [testing.boundaries] 关键数据、边界场景和剩余风险记录。

## 8. 业务规则

- [business.source] 权威业务规则来源。
- [business.domains] 业务域入口和代码地图。
- [business.risk] 高风险业务域和流程。
- [business.enums] 状态、枚举、权限码和状态码来源。

## 9. 事实治理与防过期

- 每条事实必须记录状态、来源、证据和最后核验日期。
- 模块状态必须由本检查表覆盖率计算。
- 校验器必须检查 schema、重复 ID、非法状态、证据哈希、产物哈希、coverage、模板漂移和过期时间。
- 人工补充规则必须写入 `project-custom.md`，生成器不得覆盖。
- 未定义事项先检查指定入口和既有模式，仅在新增业务语义、证据冲突、高风险或不可逆选择时询问。
- 涉及业务语义、数据契约、权限安全、持久化迁移、外部副作用、发布或 Git 高风险操作时，若项目规则、人工补充、权威文档或接口契约没有明确说明，必须向用户确认，不得凭字段名、页面文案、代码现状或模型常识自行推断。
