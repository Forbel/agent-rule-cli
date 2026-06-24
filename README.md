# agent-rule-cli

为已有项目生成一套可追溯、可校验的 AI Agent 项目规则。

它会在项目里生成 `AGENTS.md` 和 `.agent-rules/`，让 Claude Code、Codex、Cursor 等 AI 工具知道：

- 当前项目是什么技术栈、什么目录结构；
- 修 bug、加模块、改 UI、改接口、做 Git 操作时应该读哪些规则；
- 哪些事实来自代码扫描，哪些是 AI 推断，哪些必须人工确认；
- 涉及业务语义、金额、权限、状态流转等高风险内容时，什么时候必须问用户。

## 一键使用

### 方式一：交互式生成

适合你熟悉项目，并愿意在终端里确认几个问题。

```bash
npx agent-rule-cli
```

### 方式二：使用默认值生成

适合快速初始化。不会逐项询问，缺少人工确认的策略会标记为推断。

```bash
npx agent-rule-cli --defaults
```

### 方式三：AI 增强生成（推荐陌生项目使用）

适合复杂项目、陌生项目、Next.js App Router、monorepo 或非传统目录结构。

```bash
npx agent-rule-cli --enrich
```

这一步会先生成一套保守规则，并额外生成：

- `.agent-rules/ai-enrichment-task.md`：给 AI 执行的项目理解任务；
- `.agent-rules/ai-enrichment-schema.json`：AI 必须输出的候选 JSON 格式；
- `.claude/skills/enrich-agent-rules/SKILL.md`：Claude Code 的薄触发器。

然后让当前 AI 执行：

```text
执行 .agent-rules/ai-enrichment-task.md
```

AI 会阅读项目代码，生成 `.agent-rules/ai-enrichment.candidate.json`。随后运行：

```bash
npx agent-rule-cli --enrich --continue
```

`--continue` 不会让 AI 直接改正式规则文件。它只做三件事：

1. 校验 AI 生成的 candidate 是否符合 schema、是否有真实 evidence；
2. 把可信的结构结果导入 `project-facts.json`；
3. 由 CLI 重新渲染正式规则文件并执行严格校验。

结构类结果支持三种状态：

- `inferred`：有代码证据支持，但仍是 AI 推断；
- `not-applicable`：当前架构明确不采用这类结构；
- `needs-confirmation`：代码无法判断，后续实现前需要人工确认。

例如 Next.js App Router 项目可能没有传统 `controllers` 目录。AI 不应该留下“未定义”，而应该输出类似：

```text
不采用传统 controllers 目录；路由处理由 src/app/api/**/route.* 承担。
```

正式规则会显示为“不适用”或“AI 推断”，详细 evidence 保存在 `project-facts.json`。

校验已经生成的规则：

```bash
npx agent-rule-cli --verify
```

在 CI 中进行严格校验（**推荐 CI 固定使用此命令**）：

```bash
npx agent-rule-cli --verify --strict
```

`--verify` 用来检查规则结构、来源证据、模板漂移、语义层和事实有效期。

`--strict` 会把警告升级为退出码 `2`，例如：

- 高风险业务语义尚未人工确认；
- 事实来源或语义来源发生变化；
- 模块仍然是部分配置；
- 规则文件与生成时记录的 hash 不一致。

CI 建议固定使用 `--verify --strict`。不加 `--strict` 时，很多高风险项只会打印警告，命令仍可能退出 `0`。

也可以指定其他项目目录：

```bash
npx agent-rule-cli --root /path/to/project
```

## 生成内容

命令会在目标项目中生成：

- `AGENTS.md`：AI 工具的入口文件，要求先读规则索引，再按任务路由读取必要规则；
- `.agent-rules/project-index.md`：规则索引和任务路由；
- `.agent-rules/project-summary.md`：项目摘要；
- `.agent-rules/project-*.md`：当前项目规则；
- `.agent-rules/shared-*.md`：跨项目通用底线；
- `.agent-rules/project-facts.json`：机器可校验的事实、来源、状态和 hash；
- `.agent-rules/project-custom.md`：人工维护的项目例外，生成器不会覆盖；
- `.agent-rules/project-semantics.json`：业务语义层，生成器不会覆盖。

已有生成规则会在覆盖前备份。人工规则、例外和项目负责人确认过的特殊约束，应写入 `project-custom.md`，不要直接改生成文件。

脚手架会记录项目侧重（前端项目、后端项目或全栈项目），并按侧重生成对应的 shared 和 project 规则：前端项目包含 UI 规则，后端项目包含 API 契约、鉴权安全、数据持久化、任务消息和可观测性规则，全栈项目同时包含两类规则。

### 目录识别与兜底

扫描器会先按常见约定查找页面、路由、API、状态、组件和后端分层目录。遇到它不认识的布局时，例如 Next.js App Router、monorepo 或自定义目录，静态扫描可能会留下缺口。

处理方式有两种：

- 交互式生成会询问关键目录。你填写的路径会记为 `user-confirmed`；留空表示项目确实没有该目录。
- AI 增强生成会让 AI 阅读代码后输出候选。它可以把字段标为 `inferred`、`not-applicable` 或 `needs-confirmation`。

如果关键目录既没有扫描到，也没有被确认，生成过程和 `--verify` 会打印“目录识别缺口”告警，避免静默产出空规则。

### 业务域地图与影响面

`.agent-rules/project-domain-map.md` 记录扫描到的业务域（feature 目录、页面文件）、API 文件，以及"域关联（影响面）"——按目录命名和源码 `import` 引用把 feature、页面、API 聚合成域，帮助 AI 判断"改这个域会牵动哪些文件"。它由结构推断得到，仅证明文件位置关联、不证明业务语义，是导航起点而非事实裁判。

复杂路由和陌生项目推荐使用 `--enrich`。静态扫描宁可留下缺口，也不会把低置信框架结构写成业务域；AI enrichment 的结果先进入候选文件，只有带真实 evidence 且通过校验的高/中置信结构结果才会导入正式规则。

如果规则模板与项目架构不一致，AI 应该在候选中写明替代模式，而不是简单写“未定义”。例如：

- Next.js App Router 不采用传统 `controllers` 目录 → 标记 `not-applicable`，说明 route handler / server actions 承担协议适配；
- 没有独立 service 层，但服务端业务调用集中在 `src/server/actions` → 标记 `needs-confirmation` 或 `inferred`，说明新增复杂逻辑前应如何决策；
- 模板外的重要入口，如 `dir.serverActions`、`dir.serverTypes` → 会进入 `project-architecture.md` 的“AI 识别的补充架构入口”。

### 语义层（business semantics）

代码本身无法自证的业务语义——状态枚举、金额规则、权限边界、状态流转等——记录在 `.agent-rules/project-semantics.json`，配套的过程规范在 `.agent-rules/semantic-workflow.md`。

语义层不要求一次性补全。它是在修 bug、改需求、加模块时逐步积累的：

1. AI 先查当前业务域是否已有语义记录；
2. 缺失或过期时，根据本次任务涉及的真实业务整理候选；
3. 普通语义可先记录为 `inferred`；
4. 涉及金额、权限、状态流转、审核、支付、订单、退款、删除等高风险语义时，必须人工确认后才能标为 `user-confirmed`，也必须确认后才能据此实现。

每条语义都有 `evidenceRefs`。来源文件变化时，`--verify` 会提示复核。

`project-semantics.json` 和 `project-custom.md` 一样由维护者与 AI 增量维护，生成器不会覆盖；`semantic-workflow.md` 与具体工具无关，Claude Code、Codex、Cursor 等读取 `AGENTS.md` 的 agent 都可遵循。

#### 在不同 AI 工具下使用语义层

语义层有两种操作：

- **per-task（随手补全）**：每次改 bug、调需求、加模块涉及业务语义时，顺着 `AGENTS.md → project-index.md → semantic-workflow.md` 自动进入，补全本次涉及到的语义。**任何读取 `AGENTS.md` 的工具都自动生效，无需配置。**
- **reconcile（会话级对账）**：一段分析做完后，回顾本次会话分析出的所有业务点，与语义层逐点对账——缺失则补、冲突则请你确认、一致则不动，并运行 `--verify --strict`。流程写在 `semantic-workflow.md` 的"会话级对账（reconcile）"小节。

各工具的触发方式：

| 工具 | per-task 补全 | 会话级对账触发 |
| --- | --- | --- |
| **Claude Code** | 自动（读 `AGENTS.md`） | 运行生成的 `/sync-semantics` skill |
| **Codex** | 自动（读 `AGENTS.md`） | 对它说"按 `.agent-rules/semantic-workflow.md` 的会话级对账小节，核对本次会话的业务点"；想要 `/` 快捷命令可在 `~/.codex/prompts/` 放一个仅指向该文件的 prompt，安装一次 |
| **Cursor** | 自动（读 `AGENTS.md`） | 同上，用一句指令触发；也可加一条指向该文件的 project rule |
| **其他读 `AGENTS.md` 的 agent** | 自动 | 用一句指令触发会话级对账小节 |

`semantic-workflow.md` 是唯一事实源，所有工具的触发器都只是指向它的薄入口、不重复逻辑。生成的 Claude skill `.claude/skills/sync-semantics/SKILL.md` 即是这样的薄触发器（生成产物，受漂移校验）。Codex / Cursor 的快捷命令是用户级而非项目级，工具无法预装，因此它们主要靠"自动读 `AGENTS.md` + 一句话触发"。

运行环境要求 Node.js 12 或更高版本，运行时不依赖第三方 npm 包。

## 开发

源码按职责拆成独立模块，发布入口是根目录的 `agent-rules-init.cjs`，只负责加载 `src/cli.cjs` 并执行：

- `src/context.cjs`：配置、运行时状态与共享底层原语（读写、指纹、事实记录等）。
- `src/scan.cjs`：仓库扫描（身份、技术栈、目录、Git、API、业务域与影响面）。
- `src/wizard.cjs`：交互式问答与答案收集。
- `src/render.cjs`：生成 `AGENTS.md` 与各 `project-*` / 语义工作流文档。
- `src/verify.cjs`：`--verify` 的 schema、coverage、来源漂移与语义层校验。
- `src/constants.cjs`、`src/verify-core.cjs`：静态目录、coverage catalog 与纯函数判定逻辑，可直接单测。
- `src/cli.cjs`：仅编排 `main` 流程。

修改源码后运行：

```bash
npm test
```

当前 npm 包会随 CLI 一起发布 `src/` 和 `agent-rules-templates/`，不需要构建步骤。发布前建议运行 `npm pack --dry-run` 确认包内文件。

## 发布

```bash
npm login
npm publish
```

发布前可用 `npm pack --dry-run` 检查包内文件。包名首次发布后，后续版本需要先更新 `package.json` 中的 `version`。只要 CLI 行为、生成规则内容、模板文件、README 或 npm 包内容发生变动，发布前都必须同步更新版本号；已发布到 npm 的同一版本不能重复发布。
