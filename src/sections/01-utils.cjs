function note(message) {
  process.stdout.write(`\n\u001b[1;36m${message}\u001b[0m\n`)
}

function warn(message) {
  process.stdout.write(`\u001b[1;33m${message}\u001b[0m\n`)
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative))
}

function read(relative) {
  try {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8')
  } catch {
    return ''
  }
}

function readJson(relative) {
  try {
    return JSON.parse(read(relative))
  } catch {
    return null
  }
}

function run(command, commandArgs = []) {
  try {
    return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function evidencePath(value) {
  if (typeof value !== 'string') return ''
  const candidates = [value, value.split('#')[0]]
  const colonPositions = [...value.matchAll(/:/g)].map(match => match.index)
  for (const position of colonPositions) candidates.push(value.slice(0, position))
  return candidates.find(candidate => candidate && exists(candidate)) || ''
}

function fingerprint(relative, mode = 'content') {
  const full = path.join(ROOT, relative)
  if (!fs.existsSync(full)) return null
  const stat = fs.statSync(full)
  if (mode === 'existence') return { path: relative, kind: stat.isDirectory() ? 'directory-exists' : 'file-exists' }
  if (stat.isFile()) return { path: relative, kind: 'file', sha256: hashFile(full) }
  if (stat.isDirectory()) {
    const listing = listFiles(relative, 4).sort().join('\n')
    return { path: relative, kind: 'directory', sha256: crypto.createHash('sha256').update(listing).digest('hex') }
  }
  return null
}

function addFact(id, module, value, status, source, evidence, noteText = '') {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return
  const existing = facts.find(item => item.id === id)
  const fact = { id, module, value, status, source, evidence, verifiedAt: VERIFIED_AT }
  const evidenceValues = Array.isArray(evidence) ? evidence : [evidence]
  const evidenceMode = id.startsWith('dir.') || ['domain.map', 'testing.files'].includes(id) ? 'existence' : 'content'
  const evidenceRefs = evidenceValues.map(evidencePath).filter(Boolean).map(relative => fingerprint(relative, evidenceMode)).filter(Boolean)
  if (evidenceRefs.length) fact.evidenceRefs = evidenceRefs
  if (noteText) fact.note = noteText
  if (existing) Object.assign(existing, fact)
  else facts.push(fact)
}

function fact(id) {
  return facts.find(item => item.id === id)
}

function factValue(id, fallback = '') {
  const item = fact(id)
  return item && item.value !== undefined && item.value !== null ? item.value : fallback
}

function previousValue(id, fallback = '') {
  const answer = EXISTING_MANIFEST && EXISTING_MANIFEST.answers && EXISTING_MANIFEST.answers[id]
  if (answer && ['user-confirmed', 'not-applicable'].includes(answer.status)) return answer.value
  const previousFact = EXISTING_MANIFEST && EXISTING_MANIFEST.facts && EXISTING_MANIFEST.facts.find(item => item.id === id && ['user-confirmed', 'not-applicable'].includes(item.status))
  return previousFact && previousFact.value !== undefined && previousFact.value !== null ? previousFact.value : fallback
}

function markdownValue(value) {
  if (Array.isArray(value)) return value.length ? value.map(item => `\`${typeof item === 'object' ? JSON.stringify(item) : item}\``).join('、') : '未定义'
  if (value === true) return '是'
  if (value === false) return '否'
  if (value && typeof value === 'object') return `\`${JSON.stringify(value)}\``
  return String(value || '未定义')
}

function listFiles(directory, maxDepth = 3) {
  const base = path.join(ROOT, directory)
  if (!fs.existsSync(base)) return []
  const output = []
  const walk = (current, depth) => {
    if (depth > maxDepth) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'coverage', '.cache', '__pycache__', '.pytest_cache'].includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else output.push(path.relative(ROOT, full))
      if (output.length >= 500) return
    }
  }
  walk(base, 0)
  return output
}

function firstExisting(candidates, type = 'any') {
  return candidates.find(candidate => {
    const full = path.join(ROOT, candidate)
    if (!fs.existsSync(full)) return false
    if (type === 'file') return fs.statSync(full).isFile()
    if (type === 'dir') return fs.statSync(full).isDirectory()
    return true
  }) || ''
}

function packageDependencies(pkg) {
  return { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}), ...((pkg && pkg.peerDependencies) || {}) }
}

