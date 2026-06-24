# agent-rule-cli

扫描当前项目，并通过交互式向导生成可追溯、可校验的 AI Agent 项目规则。

## 一键使用

在需要生成规则的项目根目录运行：

```bash
npx agent-rule-cli
```

无需交互、使用推荐默认值：

```bash
npx agent-rule-cli --defaults
```

校验已经生成的规则：

```bash
npx agent-rule-cli --verify
```

在 CI 中进行严格校验（**推荐 CI 固定使用此命令**）：

```bash
npx agent-rule-cli --verify --strict
```

`--strict` 会把"高风险语义尚未人工确认""事实或语义来源已变化""模块仍为部分配置"等警告升级为非零退出码（2）。语义层依赖人工确认高风险业务语义，CI 不加 `--strict` 时这些情况只产生警告、仍退出 0，因此 CI 必须使用 `--verify --strict` 才能真正卡住未确认的高风险语义。

也可以指定其他项目目录：

```bash
npx agent-rule-cli --root /path/to/project
```

## 生成内容

命令会在目标项目中生成 `AGENTS.md` 和 `.agent-rules/`。已有规则会在覆盖前备份，手工维护的规则应放在 `.agent-rules/project-custom.md` 中。

脚手架会记录项目侧重（前端项目、后端项目或全栈项目），并按侧重生成对应的 shared 和 project 规则：前端项目包含 UI 规则，后端项目包含 API 契约、鉴权安全、数据持久化、任务消息和可观测性规则，全栈项目同时包含两类规则。

### 目录识别与兜底

扫描器按一组已知约定定位页面、路由、API 和后端分层目录。遇到它不认识的布局（如 Next.js App Router 的 `src/app`、monorepo 或自定义结构）时，相关目录不会被自动识别。为避免静默产出空规则：

- **交互式生成**会在向导中逐个询问未识别到的关键目录，并给出实际可选目录提示；填写的路径会被记为 `user-confirmed`，留空表示"项目确实没有该目录"。两种回答都会在重新生成（含 `--defaults`）时保留。
- 当某个**与项目侧重相符的关键目录**（前端的页面目录、后端的入口目录）既未识别也未确认时，生成过程和 `--verify` 都会打印"目录识别缺口"告警，提醒补填或在 `project-custom.md` 标注，而不会悄悄生成空的页面/路由/API 规则。

### 业务域地图与影响面

`.agent-rules/project-domain-map.md` 记录扫描到的业务域（feature 目录、页面文件）、API 文件，以及"域关联（影响面）"——按目录命名和源码 `import` 引用把 feature、页面、API 聚合成域，帮助 AI 判断"改这个域会牵动哪些文件"。它由结构推断得到，仅证明文件位置关联、不证明业务语义，是导航起点而非事实裁判。

### 语义层（business semantics）

代码本身无法自证的业务语义——状态枚举、金额规则、权限边界、状态流转等——记录在 `.agent-rules/project-semantics.json`，配套的过程规范在 `.agent-rules/semantic-workflow.md`。

语义层不要求一次性补全，而是在你修复 bug、调整需求、新增模块时由 AI 增量整理：每次改动涉及业务语义时，AI 先查该域已有语义，缺失或过期就按当前任务的真实业务整理后写回。每条语义带来源（`evidenceRefs`）和置信度（`status` 为 `inferred` 候选或 `user-confirmed` 已确认），来源文件变化时 `--verify` 会标记需复核。**涉及金额、权限、状态流转等高风险语义必须人工确认（`status=user-confirmed`）后才能据以实现**。

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
