const fs = require('fs')
const path = require('path')
const { RULE_DIR, note } = require('./context.cjs')
const { verifySemantics } = require('./verify.cjs')

function loadManifest() {
  const file = path.join(RULE_DIR, 'project-facts.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { malformed: true }
  }
}

function checkSemantics() {
  note('语义层检查结果')
  const manifest = loadManifest()
  if (!manifest) {
    process.stdout.write('错误：缺少 .agent-rules/project-facts.json，请先生成规则。\n')
    process.exitCode = 1
    return
  }
  if (manifest.malformed) {
    process.stdout.write('错误：project-facts.json 不是合法 JSON。\n')
    process.exitCode = 1
    return
  }

  const result = verifySemantics(manifest)
  result.errors.forEach(item => process.stdout.write(`错误：${item}\n`))
  result.warnings.forEach(item => process.stdout.write(`警告：${item}\n`))
  if (!result.errors.length && !result.warnings.length) {
    process.stdout.write('通过：语义层结构、风险确认、域关联和证据来源均正常。\n')
  } else if (!result.errors.length) {
    process.stdout.write('检查完成：无结构错误，但仍有语义警告需要处理。\n')
  }
  if (result.errors.length) process.exitCode = 1
  else if (result.warnings.length) process.exitCode = 2
}

module.exports = { checkSemantics }
