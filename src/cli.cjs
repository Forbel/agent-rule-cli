const fs = require('fs')
const path = require('path')
const {
  PACKAGE, COMMAND, ROOT, RULE_DIR, VERIFY_ONLY, DIFF_ONLY, DOCTOR_ONLY, MIGRATE, SEMANTICS_COMMAND, NON_INTERACTIVE, SHOW_HELP, ENRICH, ENRICH_CONTINUE, MODULES,
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
const { renderEnrichmentFiles, importAiEnrichment, printEnrichmentHandoff } = require('./enrich.cjs')
const { diffRules, doctorRules } = require('./maintenance.cjs')
const { checkSemantics } = require('./semantics.cjs')

function generateRules() {
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
  if (ENRICH) renderEnrichmentFiles()
  renderFacts()
}

async function main() {
  if (SHOW_HELP) {
    process.stdout.write(`${PACKAGE.name} v${PACKAGE.version}\n\n用法：\n  ${COMMAND} [--root <项目目录>]\n  ${COMMAND} --verify [--strict] [--root <项目目录>]\n  ${COMMAND} --doctor [--root <项目目录>]\n  ${COMMAND} --diff [--root <项目目录>]\n  ${COMMAND} --migrate [--root <项目目录>]\n  ${COMMAND} --semantics check [--root <项目目录>]\n  ${COMMAND} --profile <minimal|standard|strict> [--defaults] [--root <项目目录>]\n  ${COMMAND} --enrich [--root <项目目录>]\n  ${COMMAND} --enrich --continue [--root <项目目录>]\n\n选项：\n  --root       指定目标项目，默认当前目录\n  --profile    规则生成档位：minimal 减少文件，standard 默认完整，strict 等同 standard 并启用严格校验\n  --semantics  语义层工具；当前支持 check，用于单独检查 project-semantics.json\n  --verify     检查 schema、coverage、模板、事实来源、产物和过期时间\n  --doctor     诊断规则目录、manifest、生成产物和保留文件状态\n  --diff       预览当前规则与记录、模板和生成器版本的差异，不写入文件\n  --migrate    备份现有规则，用当前 CLI 非交互重渲染生成产物并校验\n  --strict     verify 出现 partial、undefined、过期或其他警告时返回退出码 2\n  --defaults   使用推荐默认值生成，所有未人工确认策略标记为 inferred\n  --enrich     生成保守基础规则和 AI enrichment 任务；--continue 导入候选并严格校验\n  --help       显示帮助\n`)
    return
  }
  if (!fs.existsSync(ROOT)) throw new Error(`项目目录不存在：${ROOT}`)
  if (ENRICH_CONTINUE) {
    importAiEnrichment()
    return verify()
  }
  if (VERIFY_ONLY) return verify()
  if (DIFF_ONLY) return diffRules()
  if (DOCTOR_ONLY) return doctorRules()
  if (SEMANTICS_COMMAND === 'check') return checkSemantics()

  note('AI 项目规则脚手架')
  process.stdout.write(`项目目录：${ROOT}\n`)
  warn('shared 规则来自固定模板；project 规则由可追溯事实和用户策略生成。')
  if (!NON_INTERACTIVE) {
    makeReadline()
    if (!(await askYesNo('是否继续？', true))) {
      ui.rl.close()
      return
    }
  } else if (MIGRATE) {
    warn('迁移会备份现有规则，并用当前 CLI 重渲染生成产物；project-custom.md 和 project-semantics.json 不会被覆盖。')
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

  generateRules()

  note('完成')
  process.stdout.write(`${MIGRATE ? '已迁移并重新生成规则' : '已生成规则'}。摘要：${path.join(RULE_DIR, 'project-summary.md')}\n`)
  verify()
  if (ENRICH) printEnrichmentHandoff()
}

module.exports = { main }
