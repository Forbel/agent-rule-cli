const fs = require('fs')
const path = require('path')
const {
  ROOT, COMMAND, VERIFIED_AT, NOW, ENRICH_TASK_FILE, ENRICH_SCHEMA_FILE,
  ENRICH_CANDIDATE_FILE, ENRICH_SKILL_FILE, SEMANTICS_FILE, MODULES, COVERAGE_CATALOG,
  BUSINESS_CONTRACT_FACTS, facts, answers, moduleChoices, hashFile
} = require('./context.cjs')
const {
  write,
  renderIndex,
  renderSummary,
  renderProjectRules
} = require('./render.cjs')
const { calculateManifestModule } = require('./verify-core.cjs')

const CONFIDENCE = new Set(['high', 'medium', 'low'])
const IMPORTABLE_CONFIDENCE = new Set(['high', 'medium'])
const STRUCTURAL_STATUSES = new Set(['inferred', 'not-applicable', 'needs-confirmation'])
const FACT_STATUSES = new Set(['confirmed', 'inferred', 'not-applicable', 'needs-confirmation'])

function readJsonFile(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'))
}

function writeJsonFile(relative, value) {
  const full = path.join(ROOT, relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`)
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative))
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeRefs(item) {
  return ensureArray(item && item.evidenceRefs).map(ref => typeof ref === 'string' ? { path: ref } : ref).filter(Boolean)
}

function validateEvidence(item, label, errors) {
  const refs = normalizeRefs(item)
  if (!refs.length) errors.push(`${label} 缺少 evidenceRefs`)
  for (const ref of refs) {
    if (!ref || typeof ref.path !== 'string') {
      errors.push(`${label} 的 evidenceRefs.path 必须是字符串`)
      continue
    }
    if (!exists(ref.path)) errors.push(`${label} 的 evidence 不存在：${ref.path}`)
  }
  return refs
}

function validateCandidate(candidate) {
  const errors = []
  if (!candidate || candidate.schemaVersion !== 1) errors.push('ai-enrichment.candidate.json 的 schemaVersion 必须是 1')
  for (const [key, value] of Object.entries({
    directories: candidate && candidate.directories,
    domains: candidate && candidate.domains,
    impact: candidate && candidate.impact,
    sharedAssets: candidate && candidate.sharedAssets,
    apiFacts: candidate && candidate.apiFacts,
    semantics: candidate && candidate.semantics
  })) {
    if (value !== undefined && !Array.isArray(value)) errors.push(`${key} 必须是数组`)
  }
  for (const directory of ensureArray(candidate && candidate.directories)) {
    const label = `directory:${directory && directory.id || '<unknown>'}`
    if (!directory || typeof directory.id !== 'string' || typeof directory.value !== 'string') errors.push(`${label} 必须包含字符串 id/value`)
    if (directory.confidence && !CONFIDENCE.has(directory.confidence)) errors.push(`${label} confidence 非法：${directory.confidence}`)
    if (directory.status && !STRUCTURAL_STATUSES.has(directory.status)) errors.push(`${label} status 非法：${directory.status}`)
    if (directory.status === 'needs-confirmation' && !directory.reason) errors.push(`${label} needs-confirmation 必须说明 reason`)
    validateEvidence(directory, label, errors)
  }
  for (const domain of ensureArray(candidate && candidate.domains)) {
    const label = `domain:${domain && domain.name || '<unknown>'}`
    if (!domain || typeof domain.name !== 'string' || typeof domain.root !== 'string') errors.push(`${label} 必须包含字符串 name/root`)
    if (domain.confidence && !CONFIDENCE.has(domain.confidence)) errors.push(`${label} confidence 非法：${domain.confidence}`)
    validateEvidence(domain, label, errors)
  }
  for (const group of ensureArray(candidate && candidate.impact)) {
    const label = `impact:${group && group.name || '<unknown>'}`
    if (!group || typeof group.name !== 'string') errors.push(`${label} 必须包含字符串 name`)
    if (group.confidence && !CONFIDENCE.has(group.confidence)) errors.push(`${label} confidence 非法：${group.confidence}`)
    validateEvidence(group, label, errors)
  }
  for (const asset of ensureArray(candidate && candidate.sharedAssets)) {
    const label = `sharedAsset:${asset && asset.path || '<unknown>'}`
    if (!asset || typeof asset.path !== 'string' || typeof asset.kind !== 'string' || !Array.isArray(asset.usedBy)) errors.push(`${label} 必须包含 path/kind/usedBy`)
    if (asset.confidence && !CONFIDENCE.has(asset.confidence)) errors.push(`${label} confidence 非法：${asset.confidence}`)
    validateEvidence(asset, label, errors)
  }
  for (const fact of ensureArray(candidate && candidate.apiFacts)) {
    const label = `apiFact:${fact && fact.id || '<unknown>'}`
    if (!fact || typeof fact.id !== 'string' || fact.value === undefined) errors.push(`${label} 必须包含 id/value`)
    if (fact.confidence && !CONFIDENCE.has(fact.confidence)) errors.push(`${label} confidence 非法：${fact.confidence}`)
    if (fact.status && !FACT_STATUSES.has(fact.status)) errors.push(`${label} status 非法：${fact.status}`)
    if (!/^api\.|^auth\./.test(fact && fact.id || '')) errors.push(`${label} 仅支持 api.* 或 auth.*`)
    validateEvidence(fact, label, errors)
  }
  for (const entry of ensureArray(candidate && candidate.semantics)) {
    const label = `semantic:${entry && entry.id || '<unknown>'}`
    if (!entry || typeof entry.id !== 'string' || typeof entry.domain !== 'string' || typeof entry.statement !== 'string') errors.push(`${label} 必须包含 id/domain/statement`)
    validateEvidence(entry, label, errors)
  }
  return errors
}

function renderEnrichmentFiles() {
  write(ENRICH_SCHEMA_FILE, JSON.stringify({
    schemaVersion: 1,
    output: ENRICH_CANDIDATE_FILE,
    fields: {
      domains: '真实业务域候选。只写有代码证据的域；Next.js route group、layout、error、loading、api 等框架结构不得作为业务域。',
      directories: '扫描器未识别但 AI 可从代码确认或解释的结构项，如 dir.pages、dir.api、dir.router、dir.services、dir.repositories、dir.serverActions。value 可以是真实路径，也可以是带替代模式的简短说明。',
      directoryStatus: 'directories 支持 status：inferred（代码证据支持的 AI 推断）、not-applicable（当前架构明确不采用）、needs-confirmation（代码无法判断且会影响实现决策）。结构类字段不要输出裸“未定义”。',
      architectureCoverage: '请逐项处理 project-architecture.md 会展示的结构字段：dir.api、dir.state、dir.pages、dir.router、dir.components、dir.backendEntry、dir.controllers、dir.services、dir.repositories、dir.models、dir.migrations、dir.jobs、dir.config。能确认就 inferred，架构不采用就 not-applicable，确实无法从代码判断且会影响实现才 needs-confirmation。',
      impact: '业务域影响面候选，包含 pages/apis/stores/components/feature 等路径数组。',
      sharedAssets: '被两个及以上业务域使用的组件、状态、API 或工具候选。',
      apiFacts: '接口、错误处理、认证失败和统一响应事实候选，如 api.entry、api.library、api.successBusinessCode、api.handledHttpStatuses、api.currentErrorObject、api.currentErrorPresentation、api.currentLogging、api.implementationGaps、auth.current403Behavior、auth.guardEntry。只写代码能证明的实现事实。',
      semantics: '代码无法自证的业务语义候选；高风险语义保持 inferred，不得标 user-confirmed。'
    },
    confidence: ['high', 'medium', 'low'],
    requiredEvidence: '每个条目必须带 evidenceRefs，且每个 path 必须指向仓库内真实文件。'
  }, null, 2))

  write(ENRICH_TASK_FILE, `# AI enrichment 任务：补全项目规则候选

你正在为本项目补全 \`.agent-rules/\` 规则。CLI 已完成保守扫描；你的任务是阅读代码，生成候选文件 \`${ENRICH_CANDIDATE_FILE}\`，不要直接修改正式规则文件。

## 核心原则

- 宁缺毋滥：没有明确代码证据就不要写。
- 结构类缺口尽量分类为 \`inferred\`、\`not-applicable\` 或 \`needs-confirmation\`；不要为了消灭“未定义”编造事实。
- 框架结构不是业务域：例如 Next.js 的 \`(layout)\`、\`(basic)\`、\`layout.tsx\`、\`error.tsx\`、\`loading.tsx\`、\`not-found.tsx\`、\`api\` 不得单独作为业务域。
- 当规则模板与项目架构不匹配时，请用 \`not-applicable\` 说明替代模式。例如 Next.js App Router 项目不采用传统 \`controllers\` 目录时，说明路由处理由 \`src/app/api/**/route.*\` 承担。
- 对 \`project-architecture.md\` 会展示的结构项逐项归类：\`dir.api\`、\`dir.state\`、\`dir.pages\`、\`dir.router\`、\`dir.components\`、\`dir.backendEntry\`、\`dir.controllers\`、\`dir.services\`、\`dir.repositories\`、\`dir.models\`、\`dir.migrations\`、\`dir.jobs\`、\`dir.config\`。不要只补你最先想到的几项。
- \`value\` 可以是真实路径，也可以是简短结构说明。例如 \`src/app/api（Next.js route handler）+ src/server/actions（server actions）\` 是合法的说明型目录值。
- 若发现模板外但重要的结构入口，也可输出补充 \`dir.*\`，例如 \`dir.serverActions\`、\`dir.serverTypes\`、\`dir.apiClients\`；正式规则会放入“AI 识别的补充架构入口”。
- 业务语义默认是 \`inferred\`；金额、权限、状态流转、订单、支付、退款、库存、审核等高风险语义未经用户确认不得标 \`user-confirmed\`。
- 每个候选都必须有 \`evidenceRefs\`，指向真实文件；没有 evidence 的候选不要输出。

## 建议读取顺序

1. \`AGENTS.md\`、\`.agent-rules/project-index.md\`、\`.agent-rules/project-facts.json\`。
2. 页面/路由入口：如 \`src/app/**/page.*\`、\`src/pages/**\`、\`routes/**\`。
3. 菜单、导航、layout、权限入口和 route 配置。
4. API routes、server actions、services、store、共享组件。
5. 只在必要时读业务相关文件；不要全量读取无关依赖、构建产物和缓存。

## 输出文件

请创建 \`${ENRICH_CANDIDATE_FILE}\`，格式遵循 \`${ENRICH_SCHEMA_FILE}\`，示例：

\`\`\`json
{
  "schemaVersion": 1,
  "generatedAt": "${NOW.toISOString()}",
  "domains": [
    {
      "name": "order",
      "kind": "page",
      "root": "src/app/(layout)/(basic)/order",
      "confidence": "high",
      "reason": "页面目录和相关 API/action 均指向订单业务域",
      "evidenceRefs": [{ "path": "src/app/(layout)/(basic)/order/list/page.tsx" }]
    }
  ],
  "directories": [
    {
      "id": "dir.pages",
      "value": "src/app",
      "status": "inferred",
      "confidence": "high",
      "reason": "Next.js App Router 页面均位于 src/app 下",
      "evidenceRefs": [{ "path": "src/app/(layout)/(basic)/order/list/page.tsx" }]
    },
    {
      "id": "dir.controllers",
      "value": "不采用传统 controllers 目录；路由处理由 src/app/api/**/route.* 承担",
      "status": "not-applicable",
      "confidence": "high",
      "reason": "项目使用 Next.js App Router route handler，而非传统 Controller 分层",
      "evidenceRefs": [{ "path": "src/app/api/orders/route.ts" }]
    }
  ],
  "impact": [],
  "sharedAssets": [],
  "apiFacts": [
    {
      "id": "api.currentErrorObject",
      "value": {
        "responseWrapper": "src/shared/APIResponse.java",
        "globalExceptionHandler": "src/shared/GlobalExceptionHandler.java",
        "hasStructuredErrorType": true
      },
      "status": "confirmed",
      "confidence": "high",
      "reason": "统一响应体与全局异常处理可由源码直接确认",
      "evidenceRefs": [{ "path": "src/shared/APIResponse.java" }, { "path": "src/shared/GlobalExceptionHandler.java" }]
    }
  ],
  "semantics": []
}
\`\`\`

完成后运行：

\`\`\`bash
${COMMAND} --enrich --continue
\`\`\`
`)

  write(ENRICH_SKILL_FILE, `---
name: enrich-agent-rules
description: 执行 .agent-rules/ai-enrichment-task.md，生成 ai-enrichment.candidate.json，然后运行 ${COMMAND} --enrich --continue。
disable-model-invocation: true
---

# enrich-agent-rules

完整执行 \`${ENRICH_TASK_FILE}\`。只生成候选文件 \`${ENRICH_CANDIDATE_FILE}\`，不得直接覆盖正式规则。完成后运行 \`${COMMAND} --enrich --continue\`。`)
}

function artifactHashes(manifest) {
  const artifacts = { ...(manifest.artifacts || {}) }
  for (const relative of Object.keys(artifacts)) {
    if (exists(relative)) artifacts[relative] = hashFile(path.join(ROOT, relative))
  }
  return artifacts
}

function hydrateRuntimeFromManifest(manifest) {
  facts.splice(0, facts.length, ...ensureArray(manifest.facts))
  for (const key of Object.keys(answers)) delete answers[key]
  Object.assign(answers, manifest.answers || {})
  for (const key of Object.keys(moduleChoices)) delete moduleChoices[key]
  for (const [module, state] of Object.entries(manifest.modules || {})) {
    if (state && state.status === 'ignored') moduleChoices[module] = 'ignored'
  }
}

function inferDirectories(candidate, value) {
  const explicit = ensureArray(candidate.directories).filter(item => IMPORTABLE_CONFIDENCE.has(item.confidence || 'medium'))
  const inferred = []
  const roots = ensureArray(value.domains).map(domain => domain.root).filter(Boolean)
  if (!explicit.some(item => item.id === 'dir.pages')) {
    if (roots.some(root => root.startsWith('src/app/'))) inferred.push({ id: 'dir.pages', value: 'src/app', confidence: 'high', reason: 'AI enrichment 业务域位于 src/app 下' })
    else if (roots.some(root => root.startsWith('app/'))) inferred.push({ id: 'dir.pages', value: 'app', confidence: 'high', reason: 'AI enrichment 业务域位于 app 下' })
    else if (roots.some(root => root.startsWith('src/pages/'))) inferred.push({ id: 'dir.pages', value: 'src/pages', confidence: 'high', reason: 'AI enrichment 业务域位于 src/pages 下' })
    else if (roots.some(root => root.startsWith('pages/'))) inferred.push({ id: 'dir.pages', value: 'pages', confidence: 'high', reason: 'AI enrichment 业务域位于 pages 下' })
  }
  const apis = [...new Set(ensureArray(value.apiFiles).concat(ensureArray(value.impact).flatMap(group => ensureArray(group.apis))))]
  if (!explicit.some(item => item.id === 'dir.api')) {
    if (apis.some(file => file.startsWith('src/app/api/'))) inferred.push({ id: 'dir.api', value: 'src/app/api', confidence: 'high', reason: 'AI enrichment API 文件位于 src/app/api 下' })
    else if (apis.some(file => file.startsWith('src/api/'))) inferred.push({ id: 'dir.api', value: 'src/api', confidence: 'high', reason: 'AI enrichment API 文件位于 src/api 下' })
    else if (apis.some(file => file.startsWith('api/'))) inferred.push({ id: 'dir.api', value: 'api', confidence: 'high', reason: 'AI enrichment API 文件位于 api 下' })
  }
  return [...explicit, ...inferred].filter(item => {
    if (!item.value) return false
    if (explicit.includes(item)) return true
    return exists(item.value)
  })
}

function upsertFact(manifest, fact) {
  manifest.facts = ensureArray(manifest.facts).filter(item => item.id !== fact.id)
  manifest.facts.push(fact)
}

function importDirectories(manifest, directories) {
  const candidateHash = hashFile(path.join(ROOT, ENRICH_CANDIDATE_FILE))
  for (const directory of directories) {
    const structuralStatus = directory.status || 'inferred'
    const factStatus = structuralStatus === 'needs-confirmation' ? 'needs-confirmation' : structuralStatus === 'not-applicable' ? 'not-applicable' : 'inferred'
    upsertFact(manifest, {
      id: directory.id,
      module: directory.id === 'dir.tests' ? 'testingGit' : 'architecture',
      value: directory.value,
      status: factStatus,
      source: 'ai-enrichment',
      evidence: ENRICH_CANDIDATE_FILE,
      evidenceRefs: [{ path: ENRICH_CANDIDATE_FILE, kind: 'file', sha256: candidateHash }],
      verifiedAt: VERIFIED_AT,
      note: directory.reason || (factStatus === 'not-applicable' ? '当前架构不采用该结构' : '')
    })
    manifest.answers = manifest.answers || {}
    manifest.answers[directory.id] = { value: directory.value, status: factStatus, verifiedAt: VERIFIED_AT }
  }
}

function importApiFacts(manifest, apiFacts) {
  const candidateHash = hashFile(path.join(ROOT, ENRICH_CANDIDATE_FILE))
  let imported = 0
  for (const entry of ensureArray(apiFacts).filter(item => IMPORTABLE_CONFIDENCE.has(item.confidence || 'medium'))) {
    const status = entry.status || 'inferred'
    upsertFact(manifest, {
      id: entry.id,
      module: entry.id === 'auth.guardEntry' ? 'security' : 'api',
      value: entry.value,
      status,
      source: 'ai-enrichment',
      evidence: ENRICH_CANDIDATE_FILE,
      evidenceRefs: [{ path: ENRICH_CANDIDATE_FILE, kind: 'file', sha256: candidateHash }],
      verifiedAt: VERIFIED_AT,
      note: entry.reason || ''
    })
    imported += 1
  }
  return imported
}

function updateModuleStates(manifest) {
  manifest.modules = Object.fromEntries(Object.keys(MODULES).map(module => [
    module,
    calculateManifestModule(module, manifest, { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS })
  ]))
}

function mergeSemantics(candidate) {
  if (!ensureArray(candidate.semantics).length) return { added: 0, skipped: 0 }
  const store = exists(SEMANTICS_FILE) ? readJsonFile(SEMANTICS_FILE) : { schemaVersion: 1, entries: [] }
  if (!Array.isArray(store.entries)) store.entries = []
  const seen = new Set(store.entries.map(entry => entry.id))
  let added = 0
  let skipped = 0
  for (const entry of candidate.semantics) {
    if (seen.has(entry.id)) {
      skipped += 1
      continue
    }
    store.entries.push({
      id: entry.id,
      domain: entry.domain,
      title: entry.title,
      statement: entry.statement,
      status: 'inferred',
      risk: Array.isArray(entry.risk) ? entry.risk : undefined,
      recordedBy: 'ai',
      sourceTask: 'ai-enrichment',
      evidenceRefs: normalizeRefs(entry),
      verifiedAt: VERIFIED_AT
    })
    seen.add(entry.id)
    added += 1
  }
  store.updatedAt = NOW.toISOString()
  writeJsonFile(SEMANTICS_FILE, store)
  return { added, skipped }
}

function importAiEnrichment() {
  if (!exists(ENRICH_CANDIDATE_FILE)) throw new Error(`缺少 ${ENRICH_CANDIDATE_FILE}，请先让当前 AI 执行 ${ENRICH_TASK_FILE}`)
  const candidate = readJsonFile(ENRICH_CANDIDATE_FILE)
  const errors = validateCandidate(candidate)
  if (errors.length) throw new Error(`AI enrichment 候选无效：\n- ${errors.join('\n- ')}`)
  const manifest = readJsonFile('.agent-rules/project-facts.json')
  const importedDomains = ensureArray(candidate.domains).filter(item => IMPORTABLE_CONFIDENCE.has(item.confidence || 'medium'))
  const importedImpact = ensureArray(candidate.impact).filter(item => IMPORTABLE_CONFIDENCE.has(item.confidence || 'medium'))
  const importedSharedAssets = ensureArray(candidate.sharedAssets).filter(item => IMPORTABLE_CONFIDENCE.has(item.confidence || 'medium'))
  const previousDomain = ensureArray(manifest.facts).find(item => item.id === 'domain.map')
  const previousValue = previousDomain && previousDomain.value ? previousDomain.value : {}
  const value = {
    domains: importedDomains.map(domain => ({ name: domain.name, root: domain.root, kind: domain.kind || 'page', confidence: domain.confidence || 'medium', reason: domain.reason || '' })),
    routePaths: ensureArray(candidate.routePaths || previousValue.routePaths),
    apiFiles: [...new Set(ensureArray(candidate.apiFiles || previousValue.apiFiles).concat(importedImpact.flatMap(group => ensureArray(group.apis))))].sort(),
    impact: importedImpact.map(group => ({
      name: group.name,
      feature: group.feature || null,
      pages: ensureArray(group.pages),
      apis: ensureArray(group.apis),
      stores: ensureArray(group.stores),
      components: ensureArray(group.components),
      confidence: group.confidence || 'medium',
      reason: group.reason || ''
    })),
    sharedAssets: importedSharedAssets.map(asset => ({ path: asset.path, kind: asset.kind, usedBy: asset.usedBy.slice().sort(), confidence: asset.confidence || 'medium' }))
  }
  const directories = inferDirectories(candidate, value)
  const fact = {
    id: 'domain.map',
    module: 'business',
    value,
    status: value.domains.length || value.apiFiles.length || value.impact.length ? 'confirmed' : 'undefined',
    source: 'ai-enrichment',
    evidence: ENRICH_CANDIDATE_FILE,
    evidenceRefs: [{ path: ENRICH_CANDIDATE_FILE, kind: 'file', sha256: hashFile(path.join(ROOT, ENRICH_CANDIDATE_FILE)) }],
    verifiedAt: VERIFIED_AT
  }
  upsertFact(manifest, fact)
  importDirectories(manifest, directories)
  const importedApiFacts = importApiFacts(manifest, candidate.apiFacts)
  updateModuleStates(manifest)
  const semanticResult = mergeSemantics(candidate)
  hydrateRuntimeFromManifest(manifest)
  renderIndex()
  renderSummary()
  renderProjectRules()
  manifest.artifacts = artifactHashes(manifest)
  writeJsonFile('.agent-rules/project-facts.json', manifest)
  const refreshed = readJsonFile('.agent-rules/project-facts.json')
  refreshed.artifacts = artifactHashes(refreshed)
  writeJsonFile('.agent-rules/project-facts.json', refreshed)
  process.stdout.write(`AI enrichment 已导入：关键目录 ${directories.length} 个，业务域 ${value.domains.length} 个，影响面 ${value.impact.length} 个，共享资产 ${value.sharedAssets.length} 个，API 事实 ${importedApiFacts} 条，语义新增 ${semanticResult.added} 条，跳过重复语义 ${semanticResult.skipped} 条。\n`)
}

function printEnrichmentHandoff() {
  process.stdout.write(`\n下一步：让当前 AI 执行 ${ENRICH_TASK_FILE}\n`)
  process.stdout.write(`AI 完成后运行：${COMMAND} --enrich --continue\n`)
  process.stdout.write(`::agent-rule-cli-enrich{task="${ENRICH_TASK_FILE}" continue="${COMMAND} --enrich --continue"}\n`)
}

module.exports = {
  renderEnrichmentFiles,
  importAiEnrichment,
  printEnrichmentHandoff,
  validateCandidate
}
