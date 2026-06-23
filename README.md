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

在 CI 中进行严格校验：

```bash
npx agent-rule-cli --verify --strict
```

也可以指定其他项目目录：

```bash
npx agent-rule-cli --root /path/to/project
```

## 生成内容

命令会在目标项目中生成 `AGENTS.md` 和 `.agent-rules/`。已有规则会在覆盖前备份，手工维护的规则应放在 `.agent-rules/project-custom.md` 中。

脚手架会记录项目侧重（前端项目、后端项目或全栈项目），并按侧重生成对应的 shared 和 project 规则：前端项目包含 UI 规则，后端项目包含 API 契约、鉴权安全、数据持久化、任务消息和可观测性规则，全栈项目同时包含两类规则。

运行环境要求 Node.js 12 或更高版本，运行时不依赖第三方 npm 包。

## 开发

源码按职责拆在 `src/sections/`，发布入口仍是根目录的 `agent-rules-init.cjs`。修改源码片段后运行：

```bash
npm run build
npm test
```

`npm pack` / `npm publish` 前会自动 build，确保分发文件是最新的单文件版本。

## 发布

```bash
npm login
npm publish
```

发布前可用 `npm pack --dry-run` 检查包内文件。包名首次发布后，后续版本需要先更新 `package.json` 中的 `version`。只要 CLI 行为、生成规则内容、模板文件、README 或 npm 包内容发生变动，发布前都必须同步更新版本号；已发布到 npm 的同一版本不能重复发布。
