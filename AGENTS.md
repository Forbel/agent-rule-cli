# Agent Rule CLI 项目规则

## 版本与发布

- 只要 CLI 行为、生成规则内容、模板文件、README 或 npm 包内容发生变动，发布前必须同步更新 `package.json` 的 `version`。
- 具体发布流程、发布前检查和 npm 版本规则以 `README.md` 的“发布”章节为准；不要在本文件重复维护发布命令。

## 源码与构建

- 维护源码优先修改 `src/sections/*.cjs`，不要直接把根目录 `agent-rules-init.cjs` 当作唯一源码长期编辑。
- 根目录 `agent-rules-init.cjs` 是由 `npm run build` 拼出的单文件分发入口；修改源码片段后必须运行 `npm run build` 和 `npm test`。
