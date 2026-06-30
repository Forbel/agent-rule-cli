const fs = require('fs')
const path = require('path')
const {
  PACKAGE, SHARED_TEMPLATE_DIR, ROOT, RULE_DIR, GENERATED_ARTIFACTS,
  SEMANTICS_FILE, note, warn, exists, read, hashFile
} = require('./context.cjs')

function readJsonFile(relative) {
  try {
    return JSON.parse(read(relative))
  } catch {
    return null
  }
}

function manifestPath() {
  return path.join(RULE_DIR, 'project-facts.json')
}

function loadManifest() {
  if (!fs.existsSync(manifestPath())) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath(), 'utf8'))
  } catch {
    return { malformed: true }
  }
}

function artifactRows(manifest) {
  const artifacts = manifest && manifest.artifacts && typeof manifest.artifacts === 'object' ? manifest.artifacts : {}
  const names = [...new Set([...Object.keys(artifacts), ...GENERATED_ARTIFACTS.filter(exists)])].sort()
  return names.map(relative => {
    const full = path.join(ROOT, relative)
    if (!fs.existsSync(full)) return { relative, status: 'missing', detail: '文件缺失' }
    const expected = artifacts[relative]
    if (!expected) return { relative, status: 'untracked', detail: '存在但未记录在 project-facts.json artifacts 中' }
    const current = hashFile(full)
    if (current !== expected) return { relative, status: 'changed', detail: '内容与 project-facts.json 记录不一致' }
    return { relative, status: 'current', detail: '与记录一致' }
  })
}

function sharedTemplateRows(manifest) {
  const templates = Array.isArray(manifest && manifest.sharedTemplates) ? manifest.sharedTemplates : []
  return templates.map(relative => {
    const generated = path.join(RULE_DIR, relative)
    const source = path.join(SHARED_TEMPLATE_DIR, relative)
    if (!fs.existsSync(generated)) return { relative, status: 'missing', detail: '生成的 shared 文件缺失' }
    if (!fs.existsSync(source)) return { relative, status: 'missing-source', detail: '当前包缺少 shared 模板源文件' }
    if (hashFile(generated) !== hashFile(source)) return { relative, status: 'drifted', detail: 'shared 文件与当前模板不一致' }
    return { relative, status: 'current', detail: '与当前模板一致' }
  })
}

function printRows(rows, emptyMessage) {
  const visible = rows.filter(row => row.status !== 'current')
  if (!visible.length) {
    process.stdout.write(`${emptyMessage}\n`)
    return
  }
  visible.forEach(row => process.stdout.write(`- ${row.relative}: ${row.status}；${row.detail}\n`))
}

function diffRules() {
  note('规则迁移预览')
  const manifest = loadManifest()
  if (!manifest) {
    warn('未发现 .agent-rules/project-facts.json；运行 --migrate 会按当前项目重新生成规则。')
    return
  }
  if (manifest.malformed) {
    warn('project-facts.json 不是合法 JSON；运行 --migrate 前建议先备份当前 .agent-rules。')
    return
  }

  process.stdout.write(`当前生成器版本：${PACKAGE.version}\n`)
  process.stdout.write(`规则记录版本：${manifest.generatorVersion || '未记录'}\n`)
  if (manifest.generatorVersion !== PACKAGE.version) warn('生成器版本不同；--migrate 会用当前版本重新渲染生成产物。')
  if (manifest.schemaVersion !== 2) warn(`facts schemaVersion 为 ${manifest.schemaVersion || '未记录'}；当前支持版本为 2。`)

  note('生成产物变化')
  printRows(artifactRows(manifest), '生成产物与 project-facts.json 记录一致。')

  note('shared 模板变化')
  printRows(sharedTemplateRows(manifest), 'shared 文件与当前模板一致。')

  note('保留文件')
  process.stdout.write('- .agent-rules/project-custom.md：迁移不会覆盖。\n')
  process.stdout.write('- .agent-rules/project-semantics.json：迁移不会覆盖。\n')
}

function doctorRules() {
  note('规则目录诊断')
  const errors = []
  const warnings = []
  const manifest = loadManifest()

  if (!fs.existsSync(RULE_DIR)) errors.push('缺少 .agent-rules/ 目录。')
  if (!manifest) errors.push('缺少 .agent-rules/project-facts.json。')
  else if (manifest.malformed) errors.push('project-facts.json 不是合法 JSON。')
  else {
    if (manifest.schemaVersion !== 2) errors.push(`不支持的 facts schemaVersion：${manifest.schemaVersion}`)
    if (!manifest.generatorVersion) warnings.push('project-facts.json 缺少 generatorVersion。')
    else if (manifest.generatorVersion !== PACKAGE.version) warnings.push(`规则由 ${manifest.generatorVersion} 生成，当前 CLI 为 ${PACKAGE.version}；可运行 --diff 后再 --migrate。`)
    for (const row of artifactRows(manifest)) {
      if (row.status === 'missing') errors.push(`生成产物缺失：${row.relative}`)
      else if (row.status === 'changed') warnings.push(`生成产物已修改：${row.relative}`)
    }
    for (const row of sharedTemplateRows(manifest)) {
      if (row.status === 'missing' || row.status === 'missing-source') errors.push(`${row.detail}：${row.relative}`)
      else if (row.status === 'drifted') warnings.push(`shared 模板漂移：${row.relative}`)
    }
  }

  if (!exists('.agent-rules/project-custom.md')) warnings.push('缺少 project-custom.md，人工规则没有稳定保留位置。')
  const semantics = readJsonFile(SEMANTICS_FILE)
  if (!exists(SEMANTICS_FILE)) warnings.push('缺少 project-semantics.json，语义层没有稳定保留位置。')
  else if (!semantics) errors.push('project-semantics.json 不是合法 JSON。')
  else if (semantics.schemaVersion !== 1) errors.push(`不支持的 semantics schemaVersion：${semantics.schemaVersion}`)

  if (!errors.length && !warnings.length) {
    process.stdout.write('通过：规则目录结构、manifest、生成产物和保留文件均可维护。\n')
    return
  }
  errors.forEach(item => process.stdout.write(`错误：${item}\n`))
  warnings.forEach(item => process.stdout.write(`警告：${item}\n`))
  if (errors.length) process.exitCode = 1
}

module.exports = { diffRules, doctorRules }
