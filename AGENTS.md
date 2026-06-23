# Agent Rule CLI 项目规则

## 版本与发布

- 只要 CLI 行为、生成规则内容、模板文件、README 或 npm 包内容发生变动，发布前必须同步更新 `package.json` 的 `version`。
- 具体发布流程、发布前检查和 npm 版本规则以 `README.md` 的“发布”章节为准；不要在本文件重复维护发布命令。

## 源码与构建

- 维护源码优先修改 `src/*.cjs`，根目录 `agent-rules-init.cjs` 只保留为很薄的 npm bin 入口。
- 当前包采用多文件发布：`agent-rules-init.cjs`、`src/` 和 `agent-rules-templates/` 会一起进入 npm 包；不再使用文本拼接 build。
- 修改源码后必须运行 `npm test`，发布前建议运行 `npm pack --dry-run` 检查包内文件。
