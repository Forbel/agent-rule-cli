const fs = require('fs')
const path = require('path')
const {
  PACKAGE, COMMAND, ROOT, RULE_DIR, VERIFY_ONLY, NON_INTERACTIVE, SHOW_HELP, MODULES,
  facts, ui, note, warn, markdownValue
} = require('./context.cjs')
const { scanAll } = require('./scan.cjs')
const { makeReadline, askYesNo, collectAnswers, directoryGapWarnings } = require('./wizard.cjs')
const {
  renderStatusLines, backupExisting, cleanupGenerated, copyShared, ensureCustomRules,
  ensureSemanticsStore, renderAgents, renderIndex, renderSummary, renderProjectRules,
  renderSemanticWorkflow, renderSemanticSkill, renderFacts
} = require('./render.cjs')
const { verify } = require('./verify.cjs')

async function main() {
  if (SHOW_HELP) {
    process.stdout.write(`${PACKAGE.name} v${PACKAGE.version}\n\n用法：\n  ${COMMAND} [--root <项目目录>]\n  ${COMMAND} --verify [--strict] [--root <项目目录>]\n\n选项：\n  --root       指定目标项目，默认当前目录\n  --verify     检查 schema、coverage、模板、事实来源、产物和过期时间\n  --strict     verify 出现 partial、undefined、过期或其他警告时返回退出码 2\n  --defaults   使用推荐默认值生成，所有未人工确认策略标记为 inferred\n  --help       显示帮助\n`)
    return
  }
  if (!fs.existsSync(ROOT)) throw new Error(`项目目录不存在：${ROOT}`)
  if (VERIFY_ONLY) return verify()

  note('AI 项目规则脚手架')
  process.stdout.write(`项目目录：${ROOT}\n`)
  warn('shared 规则来自固定模板；project 规则由可追溯事实和用户策略生成。')
  if (!NON_INTERACTIVE) {
    makeReadline()
    if (!(await askYesNo('是否继续？', true))) {
      ui.rl.close()
      return
    }
  }

  scanAll()
  note('自动扫描摘要')
  process.stdout.write(`${facts.map(item => `- ${item.id}: ${markdownValue(item.value)}（${item.status}）`).join('\n')}\n`)
  await collectAnswers()
  if (ui.rl) ui.rl.close()

  note('模块覆盖状态')
  process.stdout.write(`${renderStatusLines(Object.keys(MODULES))}\n`)
  const directoryGaps = directoryGapWarnings()
  if (directoryGaps.length) {
    note('目录识别缺口')
    directoryGaps.forEach(message => warn(message))
  }
  if (!NON_INTERACTIVE) {
    makeReadline()
    if (!(await askYesNo('确认备份现有规则并生成？', true))) {
      ui.rl.close()
      return
    }
    ui.rl.close()
  }

  backupExisting()
  fs.mkdirSync(RULE_DIR, { recursive: true })
  cleanupGenerated()
  copyShared()
  ensureCustomRules()
  ensureSemanticsStore()
  renderAgents()
  renderIndex()
  renderSummary()
  renderProjectRules()
  renderSemanticWorkflow()
  renderSemanticSkill()
  renderFacts()

  note('完成')
  process.stdout.write(`已生成规则。摘要：${path.join(RULE_DIR, 'project-summary.md')}\n`)
  verify()
}

module.exports = { main }
