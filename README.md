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

### 业务域地图与影响面

`.agent-rules/project-domain-map.md` 记录扫描到的业务域（feature 目录、页面文件）、API 文件，以及"域关联（影响面）"——按目录命名和源码 `import` 引用把 feature、页面、API 聚合成域，帮助 AI 判断"改这个域会牵动哪些文件"。它由结构推断得到，仅证明文件位置关联、不证明业务语义，是导航起点而非事实裁判。

### 语义层（business semantics）

代码本身无法自证的业务语义——状态枚举、金额规则、权限边界、状态流转等——记录在 `.agent-rules/project-semantics.json`，配套的过程规范在 `.agent-rules/semantic-workflow.md`。

语义层不要求一次性补全，而是在你修复 bug、调整需求、新增模块时由 AI 增量整理：每次改动涉及业务语义时，AI 先查该域已有语义，缺失或过期就按当前任务的真实业务整理后写回。每条语义带来源（`evidenceRefs`）和置信度（`status` 为 `inferred` 候选或 `user-confirmed` 已确认），来源文件变化时 `--verify` 会标记需复核。**涉及金额、权限、状态流转等高风险语义必须人工确认（`status=user-confirmed`）后才能据以实现**。

`project-semantics.json` 和 `project-custom.md` 一样由维护者与 AI 增量维护，生成器不会覆盖；`semantic-workflow.md` 与具体工具无关，Claude Code、Codex、Cursor 等读取 `AGENTS.md` 的 agent 都可遵循。

运行环境要求 Node.js 12 或更高版本，运行时不依赖第三方 npm 包。

## 开发

源码按职责拆在 `src/`，发布入口是根目录的 `agent-rules-init.cjs`。入口文件只负责加载 `src/cli.cjs` 并执行，核心规则判定逻辑可从独立模块直接单测。

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
