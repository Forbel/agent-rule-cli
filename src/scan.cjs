const fs = require('fs')
const path = require('path')
const {
  ROOT, warn, exists, read, readJson, run, addFact, factValue,
  listFiles, firstExisting, packageDependencies
} = require('./context.cjs')
const { runScannerAdapters } = require('./scanners/index.cjs')

function scanProjectIdentity() {
  const pkg = readJson('package.json')
  let name = (pkg && pkg.name) || ''
  let evidence = pkg && pkg.name ? 'package.json#name' : ''

  if (!name && exists('pyproject.toml')) {
    const match = read('pyproject.toml').match(/^name\s*=\s*["']([^"']+)/m)
    name = match ? match[1] : ''
    evidence = name ? 'pyproject.toml#name' : ''
  }
  if (!name && exists('Cargo.toml')) {
    const match = read('Cargo.toml').match(/^name\s*=\s*["']([^"']+)/m)
    name = match ? match[1] : ''
    evidence = name ? 'Cargo.toml#package.name' : ''
  }
  if (!name && exists('go.mod')) {
    const match = read('go.mod').match(/^module\s+([^\s]+)/m)
    name = match ? match[1].split('/').pop() : ''
    evidence = name ? 'go.mod#module' : ''
  }
  if (!name) {
    name = path.basename(ROOT)
    evidence = 'project directory name'
  }

  addFact('project.name', 'architecture', name, evidence === 'project directory name' ? 'inferred' : 'confirmed', 'repository', evidence)
}

function scanTechnology() {
  const technologies = []
  const evidence = []
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const depMap = {
    react: 'React', vue: 'Vue', angular: 'Angular', '@angular/core': 'Angular', next: 'Next.js', nuxt: 'Nuxt',
    axios: 'Axios', redux: 'Redux', '@reduxjs/toolkit': 'Redux Toolkit', zustand: 'Zustand', vuex: 'Vuex', pinia: 'Pinia',
    'element-ui': 'Element UI', 'element-plus': 'Element Plus', antd: 'Ant Design', '@mui/material': 'MUI',
    vite: 'Vite', webpack: 'Webpack', typescript: 'TypeScript', sass: 'Sass', 'node-sass': 'node-sass'
  }
  for (const [dep, label] of Object.entries(depMap)) {
    if (deps[dep]) {
      technologies.push(label)
      evidence.push(`package.json:${dep}`)
    }
  }
  const fileTech = [
    ['pyproject.toml', 'Python'], ['requirements.txt', 'Python'], ['Pipfile', 'Python'], ['go.mod', 'Go'],
    ['Cargo.toml', 'Rust'], ['pom.xml', 'Java/Maven'], ['build.gradle', 'Java/Gradle'], ['composer.json', 'PHP/Composer'],
    ['Gemfile', 'Ruby'], ['mix.exs', 'Elixir'], ['Package.swift', 'Swift']
  ]
  for (const [file, label] of fileTech) {
    if (exists(file) && !technologies.includes(label)) {
      technologies.push(label)
      evidence.push(file)
    }
  }
  const csproj = fs.readdirSync(ROOT).find(file => file.endsWith('.csproj'))
  if (csproj) {
    technologies.push('.NET')
    evidence.push(csproj)
  }
  addFact('stack.technologies', 'architecture', technologies, technologies.length ? 'confirmed' : 'undefined', 'dependency/config scan', evidence)
}

function inferProjectScope() {
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const frontendDeps = ['react', 'vue', 'angular', '@angular/core', 'next', 'nuxt', 'svelte', 'vite', 'webpack', '@vitejs/plugin-react', '@vitejs/plugin-vue']
  const backendDeps = ['express', 'koa', 'fastify', 'nestjs', '@nestjs/core', 'hapi', '@hapi/hapi', 'apollo-server', 'graphql-yoga', 'prisma', 'typeorm', 'sequelize', 'mongoose']
  const hasFrontend = frontendDeps.some(dep => deps[dep]) || ['src/views', 'src/pages', 'pages', 'app/pages', 'src/components', 'components'].some(exists)
  const hasBackend = backendDeps.some(dep => deps[dep]) || ['server', 'src/server', 'src/controllers', 'src/routes', 'src/main/java', 'cmd', 'internal', 'pkg', 'migrations'].some(exists) || ['pyproject.toml', 'requirements.txt', 'Pipfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile', 'mix.exs'].some(exists)
  if (hasFrontend && hasBackend) return 'fullstack'
  if (hasBackend) return 'backend'
  return 'frontend'
}

function scanDirectories() {
  const definitions = {
    'dir.pages': ['src/views', 'src/pages', 'pages', 'lib/screens'],
    'dir.router': ['src/router', 'router', 'routes', 'config/routes'],
    'dir.components': ['src/components', 'components', 'shared/components', 'app/components'],
    'dir.utils': ['src/utils', 'utils', 'lib', 'app/lib', 'src/lib'],
    'dir.api': ['src/api', 'api', 'src/apis', 'apis', 'src/services', 'services', 'app/services'],
    'dir.features': ['src/features', 'features', 'src/modules', 'modules', 'app/features'],
    'dir.state': ['src/store', 'store', 'src/stores', 'stores', 'state'],
    'dir.assets': ['src/assets', 'assets', 'public', 'static'],
    'dir.backendEntry': ['server', 'src/server', 'cmd', 'app', 'src/main'],
    'dir.controllers': ['src/controllers', 'controllers', 'src/routes', 'routes', 'internal/handler', 'internal/handlers', 'handlers'],
    'dir.services': ['src/services', 'services', 'internal/service', 'internal/services', 'app/services'],
    'dir.repositories': ['src/repositories', 'repositories', 'internal/repository', 'internal/repositories', 'src/dao', 'dao'],
    'dir.models': ['src/models', 'models', 'internal/model', 'internal/models', 'domain', 'src/domain'],
    'dir.migrations': ['migrations', 'db/migrations', 'database/migrations', 'prisma/migrations'],
    'dir.jobs': ['jobs', 'src/jobs', 'workers', 'src/workers', 'tasks', 'src/tasks', 'cron'],
    'dir.config': ['config', 'configs', 'src/config', 'internal/config'],
    'dir.tests': ['tests', 'test', '__tests__', 'spec', 'src/__tests__']
  }
  for (const [id, candidates] of Object.entries(definitions)) {
    const value = firstExisting(candidates, 'dir')
    if (value) addFact(id, id === 'dir.tests' ? 'testingGit' : 'architecture', value, 'confirmed', 'filesystem', value)
  }
  runScannerAdapters('directories')
  scanJavaBackendDirectories()
  scanPythonBackendDirectories()
}

function addDirectoryFactIfMissing(id, value, noteText = '') {
  if (!value || factValue(id)) return
  addFact(id, id === 'dir.tests' ? 'testingGit' : 'architecture', value, 'confirmed', 'filesystem', value, noteText)
}

function scanJavaBackendDirectories() {
  const roots = javaSourceRoots()
  if (!roots.length) return
  const files = roots.flatMap(root => listFiles(root, 8).filter(file => file.endsWith('.java')))
  const firstMatchingFile = pattern => files.find(file => pattern.test(file) || pattern.test(read(file))) || ''
  const firstDirContaining = segment => {
    const file = files.find(item => item.split('/').includes(segment) || item.includes(`/${segment}/`))
    return file ? file.slice(0, file.indexOf(`/${segment}/`) + segment.length + 1) : ''
  }
  const backendEntry = firstMatchingFile(/SpringApplication\.run|@SpringBootApplication\b/)
  if (backendEntry && !factValue('dir.backendEntry')) addFact('dir.backendEntry', 'architecture', backendEntry, 'confirmed', 'filesystem', backendEntry)
  addDirectoryFactIfMissing('dir.controllers', firstDirContaining('controller'))
  addDirectoryFactIfMissing('dir.services', firstDirContaining('service'))
  addDirectoryFactIfMissing('dir.repositories', firstDirContaining('repository') || firstDirContaining('dao') || firstDirContaining('mapper'))
  addDirectoryFactIfMissing('dir.models', firstDirContaining('entity') || firstDirContaining('dto') || firstDirContaining('model') || firstDirContaining('domain'))
  addDirectoryFactIfMissing('dir.config', firstDirContaining('config'))
  addDirectoryFactIfMissing('dir.jobs', firstDirContaining('job') || firstDirContaining('scheduler') || firstDirContaining('mq'))
  const mapperDir = roots.map(root => root.replace(/src\/main\/java$/, 'src/main/resources/mapper')).find(exists)
  addDirectoryFactIfMissing('dir.migrations', firstExisting(['src/main/resources/db/migration', 'src/main/resources/db/changelog', mapperDir].filter(Boolean), 'dir'))
}

function scanPythonBackendDirectories() {
  if (!exists('pyproject.toml') && !exists('requirements.txt') && !exists('Pipfile') && !exists('manage.py')) return
  addDirectoryFactIfMissing('dir.backendEntry', firstExisting(['app', 'src', 'server', '.'], 'dir'))
  addDirectoryFactIfMissing('dir.controllers', firstExisting(['app/api', 'app/routes', 'src/api', 'src/routes', 'api', 'routes'], 'dir'))
  addDirectoryFactIfMissing('dir.services', firstExisting(['app/services', 'src/services', 'services'], 'dir'))
  addDirectoryFactIfMissing('dir.repositories', firstExisting(['app/repositories', 'src/repositories', 'repositories', 'app/db', 'src/db'], 'dir'))
  addDirectoryFactIfMissing('dir.models', firstExisting(['app/models', 'src/models', 'models', 'app/schemas', 'src/schemas'], 'dir'))
  addDirectoryFactIfMissing('dir.migrations', firstExisting(['migrations', 'alembic/versions'], 'dir'))
  addDirectoryFactIfMissing('dir.config', firstExisting(['config', 'settings', 'app/config', 'src/config'], 'dir'))
}

function getGitSnapshot() {
  if (!exists('.git')) return null
  const current = run('git', ['branch', '--show-current'])
  const branches = run('git', ['branch', '--format=%(refname:short)']).split('\n').filter(Boolean)
  const remoteHead = run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
  const defaultCandidate = remoteHead || (branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : '')
  const branchCandidates = [...new Set([remoteHead, branches.includes('main') ? 'main' : '', branches.includes('master') ? 'master' : '', current].filter(Boolean))]
  return { current, branches, remoteHead, defaultCandidate, branchCandidates }
}

function scanGit() {
  const snapshot = getGitSnapshot()
  if (!snapshot) {
    addFact('git.repository', 'testingGit', false, 'confirmed', 'filesystem', 'no .git directory')
    return
  }
  const { current, branches, remoteHead, defaultCandidate, branchCandidates } = snapshot
  addFact('git.repository', 'testingGit', true, 'confirmed', 'git', '.git')
  addFact('git.currentBranch', 'testingGit', current, 'confirmed', 'git', 'git branch --show-current')
  addFact('git.branches', 'testingGit', branches, 'confirmed', 'git', 'git branch --format=%(refname:short)')
  addFact('git.branchCandidates', 'testingGit', branchCandidates, 'confirmed', 'git', 'remote HEAD, conventional branches and current branch')
  if (remoteHead) addFact('git.remoteHead', 'testingGit', remoteHead, 'confirmed', 'git', 'refs/remotes/origin/HEAD')
  if (defaultCandidate) addFact('git.defaultBranchCandidate', 'testingGit', defaultCandidate, remoteHead ? 'confirmed' : 'inferred', 'git', remoteHead ? 'refs/remotes/origin/HEAD' : 'local branch convention')
}

function collectTestFiles(testDir) {
  return testDir ? listFiles(testDir, 4).filter(file => /(?:spec|test)\.[^.]+$|_test\.[^.]+$/.test(file)).slice(0, 50) : []
}

function scanCommandsAndTests() {
  const commands = []
  const pkg = readJson('package.json')
  if (pkg && pkg.scripts) {
    const scriptEffects = (name, seen = new Set()) => {
      if (seen.has(name)) return { writesSource: false, writesArtifacts: false, writesCache: false, longRunning: false }
      seen.add(name)
      const command = pkg.scripts[name] || ''
      const category = /lint|format/.test(name) ? 'lint' : /test|spec/.test(name) ? 'test' : /build|compile/.test(name) ? 'build' : /dev|serve|start|preview|watch/.test(name) ? 'dev' : 'other'
      const effects = {
        writesSource: /--fix\b|--write\b|prettier\s+--write|ruff\s+.*--fix|\bsvgo\b/.test(command),
        writesArtifacts: category === 'build' || /\b(?:webpack|vite|rollup|tsc|build)\b/.test(command),
        writesCache: /--clearCache\b|\bclear-cache\b/.test(command),
        longRunning: category === 'dev' || /--watch\b|\bserve\b/.test(command)
      }
      const dependencies = [...command.matchAll(/npm\s+run\s+([\w:.-]+)/g)].map(match => match[1])
      for (const dependency of dependencies) {
        const nested = scriptEffects(dependency, new Set(seen))
        for (const key of Object.keys(effects)) effects[key] = effects[key] || nested[key]
      }
      return effects
    }
    for (const [name, command] of Object.entries(pkg.scripts)) {
      const category = /lint|format/.test(name) ? 'lint' : /test|spec/.test(name) ? 'test' : /build|compile/.test(name) ? 'build' : /dev|serve|start/.test(name) ? 'dev' : 'other'
      const effects = scriptEffects(name)
      commands.push({ name: `npm run ${name}`, raw: command, category, ...effects, safeForAutomaticExecution: !effects.writesSource && !effects.longRunning })
    }
  }
  const pythonConfig = `${read('pyproject.toml')}\n${read('requirements.txt')}\n${read('Pipfile')}`
  if (/\bpytest\b|\[tool\.pytest/.test(pythonConfig)) commands.push({ name: 'pytest', category: 'test', writesSource: false, writesArtifacts: false, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: 'Python test configuration' })
  if (/\bruff\b|\[tool\.ruff/.test(pythonConfig)) commands.push({ name: 'ruff check .', category: 'lint', writesSource: false, writesArtifacts: false, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: 'Python lint configuration' })
  const ecosystemCommands = [
    ['Cargo.toml', [{ name: 'cargo test', category: 'test' }, { name: 'cargo clippy', category: 'lint' }]],
    ['go.mod', [{ name: 'go test ./...', category: 'test' }, { name: 'go vet ./...', category: 'lint' }]],
    ['pom.xml', [{ name: 'mvn test', category: 'test' }]],
    ['build.gradle', [{ name: './gradlew test', category: 'test' }]],
    ['composer.json', [{ name: 'composer test', category: 'test' }]]
  ]
  for (const [file, candidates] of ecosystemCommands) {
    if (exists(file)) commands.push(...candidates.map(command => ({ ...command, writesSource: false, writesArtifacts: true, writesCache: true, longRunning: false, safeForAutomaticExecution: true, source: file })))
  }
  const testDir = factValue('dir.tests')
  const testFiles = collectTestFiles(testDir)
  const commandEvidence = [pkg && pkg.scripts ? 'package.json#scripts' : '', ...ecosystemCommands.filter(([file]) => exists(file)).map(([file]) => file), /\bpytest\b/.test(pythonConfig) ? 'Python pytest configuration' : '', /\bruff\b/.test(pythonConfig) ? 'Python ruff configuration' : ''].filter(Boolean)
  addFact('testing.commands', 'testingGit', commands, commands.length ? 'confirmed' : 'undefined', 'configuration scan', commandEvidence)
  addFact('testing.files', 'testingGit', testFiles, testFiles.length ? 'confirmed' : 'undefined', 'filesystem', testDir || 'known test directories')
}

function scanFrontendAndState() {
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const ui = [['element-ui', 'Element UI'], ['element-plus', 'Element Plus'], ['antd', 'Ant Design'], ['@mui/material', 'MUI'], ['@chakra-ui/react', 'Chakra UI'], ['vuetify', 'Vuetify']].find(([dep]) => deps[dep])
  if (ui) addFact('ui.library', 'ui', ui[1], 'confirmed', 'dependency scan', `package.json:${ui[0]}`)
  const state = [['vuex', 'Vuex'], ['pinia', 'Pinia'], ['@reduxjs/toolkit', 'Redux Toolkit'], ['redux', 'Redux'], ['zustand', 'Zustand'], ['mobx', 'MobX']].find(([dep]) => deps[dep])
  if (state) addFact('state.library', 'state', state[1], 'confirmed', 'dependency scan', `package.json:${state[0]}`)
  if (factValue('dir.state')) addFact('state.directory', 'state', factValue('dir.state'), 'confirmed', 'filesystem', factValue('dir.state'))
}

function javaSourceRoots() {
  const roots = []
  const direct = ['src/main/java']
  for (const candidate of direct) if (exists(candidate)) roots.push(candidate)
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || ['node_modules', 'target', 'build', 'dist'].includes(entry.name)) continue
    const candidate = path.join(entry.name, 'src/main/java')
    if (exists(candidate)) roots.push(candidate)
  }
  return [...new Set(roots)]
}

function findJavaFiles(pattern, limit = 50) {
  const files = []
  for (const root of javaSourceRoots()) {
    for (const file of listFiles(root, 8)) {
      if (!file.endsWith('.java')) continue
      if (pattern.test(file) || pattern.test(read(file))) files.push(file)
      if (files.length >= limit) return files
    }
  }
  return files
}

function firstJavaFile(pattern) {
  return findJavaFiles(pattern, 1)[0] || ''
}

function scanJavaSpringApiAndAuth() {
  const roots = javaSourceRoots()
  if (!roots.length && !exists('pom.xml') && !exists('build.gradle')) return false

  const controllerFiles = findJavaFiles(/@(RestController|Controller)\b|@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b/, 80)
  const clientFiles = findJavaFiles(/@FeignClient\b|interface\s+\w*(?:Client|Api)\b[\s\S]{0,240}@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b/, 80)
  const adviceFile = firstJavaFile(/@(RestControllerAdvice|ControllerAdvice)\b/)
  const responseFile = firstJavaFile(/class\s+\w*(?:API|Api|Base)?Response\b|class\s+\w*Result\b/)
  const businessExceptionFile = firstJavaFile(/class\s+\w*(?:Business|Biz|Service|Domain)Exception\b/)
  const shiroFilterFile = firstJavaFile(/extends\s+AuthenticatingFilter\b|ShiroFilter|onAccessDenied|onLoginFailure/)
  const securityEntry = shiroFilterFile || firstJavaFile(/SecurityFilterChain|WebSecurityConfigurerAdapter|OncePerRequestFilter|HandlerInterceptor|preHandle\s*\(/)
  const apiEvidence = [...clientFiles.slice(0, 2), ...controllerFiles.slice(0, 2), adviceFile, responseFile].filter(Boolean)

  if (!apiEvidence.length) return false

  const entryParts = []
  if (clientFiles.length) entryParts.push(`Spring MVC/Feign 契约接口 ${commonParent(clientFiles) || clientFiles[0]}`)
  if (controllerFiles.length) entryParts.push(`Controller 实现 ${commonParent(controllerFiles) || controllerFiles[0]}`)
  if (adviceFile) entryParts.push(`全局异常处理 ${adviceFile}`)
  addFact('api.entry', 'api', entryParts.join('；') || apiEvidence[0], 'confirmed', 'Java/Spring source scan', apiEvidence)
  addFact('api.library', 'api', 'Spring MVC / Spring Boot', 'confirmed', 'Java/Spring source scan', apiEvidence)

  if (responseFile) {
    const source = read(responseFile)
    const codeMatch = source.match(/\bcode\s*=\s*["']([^"']+)["']/) || source.match(/setCode\s*\(\s*["']([^"']+)["']\s*\)/)
    if (codeMatch) addFact('api.successBusinessCode', 'api', { value: codeMatch[1], type: 'string' }, 'confirmed', 'Java response wrapper scan', `${responseFile}:code`)
  }

  const statusCodes = new Set()
  const headers = new Set()
  const scannedFiles = [...new Set([adviceFile, shiroFilterFile, securityEntry, ...controllerFiles.slice(0, 20)].filter(Boolean))]
  for (const file of scannedFiles) {
    const source = read(file)
    const httpStatusMap = {
      OK: 200,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      INTERNAL_SERVER_ERROR: 500
    }
    for (const match of source.matchAll(/@ResponseStatus\s*\(\s*HttpStatus\.([A-Z_]+)/g)) {
      if (httpStatusMap[match[1]]) statusCodes.add(httpStatusMap[match[1]])
    }
    for (const match of source.matchAll(/setStatus\s*\(\s*(?:HttpStatus\.[A-Z_]+\.value\(\)|(\d{3}))/g)) {
      if (match[1]) statusCodes.add(Number(match[1]))
    }
    for (const match of source.matchAll(/setHeader\s*\(\s*["']([^"']+)["']/g)) headers.add(match[1])
  }
  if (statusCodes.size) addFact('api.handledHttpStatuses', 'api', [...statusCodes].sort((a, b) => a - b), 'confirmed', 'Java/Spring source scan', scannedFiles)
  if (headers.size) addFact('api.headers', 'api', [...headers].sort(), 'confirmed', 'Java/Spring source scan', scannedFiles)

  const adviceSource = adviceFile ? read(adviceFile) : ''
  const errorEvidence = [adviceFile, responseFile, businessExceptionFile].filter(Boolean)
  if (errorEvidence.length) {
    addFact('api.currentErrorObject', 'api', {
      responseWrapper: responseFile || '',
      businessException: businessExceptionFile || '',
      globalExceptionHandler: adviceFile || '',
      returnsStructuredFailure: /APIResponse\.fail|ResponseEntity|Result\.fail/.test(adviceSource),
      hasStructuredErrorType: Boolean(businessExceptionFile || responseFile)
    }, 'confirmed', 'Java/Spring exception scan', errorEvidence)
    addFact('api.currentErrorPresentation', 'api', {
      globalExceptionHandler: Boolean(adviceFile),
      exceptionHandlerMethods: (adviceSource.match(/@ExceptionHandler\b/g) || []).length,
      returnsUnifiedFailureBody: /APIResponse\.fail|Result\.fail|ResponseEntity/.test(adviceSource),
      hasDuplicateSuppression: false
    }, 'confirmed', 'Java/Spring exception scan', errorEvidence)
    addFact('api.currentLogging', 'api', {
      loggerCalls: (adviceSource.match(/\blog\.(?:error|warn|info|debug)\s*\(/g) || []).length,
      logsStackTrace: /Throwables\.getStackTraceAsString|printStackTrace|getStackTrace/.test(adviceSource),
      sanitizesRequestLineBreaks: /replaceAll\s*\(\s*["']\[\\r\\n\]/.test(adviceSource)
    }, 'confirmed', 'Java/Spring exception scan', errorEvidence)
  }

  if (securityEntry) {
    const source = read(securityEntry)
    addFact('auth.guardEntry', 'security', securityEntry, 'confirmed', 'Java/Spring security scan', securityEntry)
    addFact('auth.current403Behavior', 'api', {
      entry: securityEntry,
      framework: /Shiro/.test(source) ? 'Apache Shiro' : 'Spring Security / interceptor',
      returnsUnifiedFailureBody: /APIResponse\.fail|Result\.fail|ResponseEntity/.test(source),
      handledStatuses: [...statusCodes].filter(code => [401, 403, 463, 464].includes(code)),
      clearsCredential: /remove|delete|clear|invalidate|logout/i.test(source),
      hasSingleFlightGuard: false
    }, 'confirmed', 'Java/Spring security scan', securityEntry)
  }

  const gaps = []
  if (adviceFile && /Throwables\.getStackTraceAsString|printStackTrace|getStackTrace/.test(adviceSource)) gaps.push('全局异常日志会记录堆栈，涉及敏感上下文时需确认脱敏策略')
  if (securityEntry && ![...statusCodes].some(code => [401, 403].includes(code))) gaps.push('认证/权限失败未检测到标准 HTTP 401/403，可能使用自定义状态码或业务码')
  if (!adviceFile) gaps.push('未检测到 @ControllerAdvice / @RestControllerAdvice 全局异常处理入口')
  if (gaps.length) addFact('api.implementationGaps', 'api', gaps, 'confirmed', 'Java/Spring source scan', scannedFiles.length ? scannedFiles : apiEvidence)

  return true
}

function scanGenericBackendApiAndAuth() {
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const backendLibraries = [
    ['express', 'Express'],
    ['@nestjs/core', 'NestJS'],
    ['koa', 'Koa'],
    ['fastify', 'Fastify'],
    ['hapi', 'hapi'],
    ['@hapi/hapi', 'hapi']
  ]
  const nodeLibrary = backendLibraries.find(([dep]) => deps[dep])
  const pythonText = `${read('pyproject.toml')}\n${read('requirements.txt')}\n${read('Pipfile')}`.toLowerCase()
  const pythonLibrary = /\bfastapi\b/.test(pythonText) ? 'FastAPI' : /\bdjango\b/.test(pythonText) ? 'Django' : /\bflask\b/.test(pythonText) ? 'Flask' : ''
  const goLibrary = exists('go.mod') ? 'Go HTTP server' : ''
  const library = nodeLibrary ? nodeLibrary[1] : pythonLibrary || goLibrary
  if (!library) return false

  const candidates = [
    'src/server.js', 'src/server.ts', 'src/app.js', 'src/app.ts', 'server.js', 'server.ts', 'app.js', 'app.ts',
    'src/main.ts', 'main.go', 'cmd/server/main.go', 'cmd/api/main.go', 'app/main.py', 'main.py', 'manage.py'
  ]
  const entry = firstExisting(candidates, 'file') || factValue('dir.controllers') || factValue('dir.backendEntry')
  if (entry) addFact('api.entry', 'api', entry, 'confirmed', 'backend source scan', entry)
  if (entry && !factValue('dir.backendEntry')) addFact('dir.backendEntry', 'architecture', fs.statSync(path.join(ROOT, entry)).isFile() ? path.dirname(entry) : entry, 'confirmed', 'filesystem', entry)
  addFact('api.library', 'api', library, 'confirmed', 'dependency/config scan', nodeLibrary ? `package.json:${nodeLibrary[0]}` : pythonLibrary ? 'Python dependency scan' : 'go.mod')

  const sourceFiles = []
  for (const dir of [factValue('dir.controllers'), factValue('dir.backendEntry'), 'src', 'app', 'server', 'cmd']) {
    if (dir && exists(dir)) sourceFiles.push(...listFiles(dir, 4).filter(file => /\.(js|ts|py|go)$/.test(file)).slice(0, 40))
  }
  const sources = [...new Set(sourceFiles)].map(file => read(file)).join('\n')
  const statusCodes = [
    ...sources.matchAll(/status\s*\(\s*(\d{3})\s*\)/g),
    ...sources.matchAll(/status_code\s*=\s*(\d{3})/g),
    ...sources.matchAll(/Status(?:OK|BadRequest|Unauthorized|Forbidden|NotFound|InternalServerError)/g)
  ].map(match => {
    if (match[1]) return Number(match[1])
    const map = { StatusOK: 200, StatusBadRequest: 400, StatusUnauthorized: 401, StatusForbidden: 403, StatusNotFound: 404, StatusInternalServerError: 500 }
    return map[match[0]]
  }).filter(Boolean)
  if (statusCodes.length) addFact('api.handledHttpStatuses', 'api', [...new Set(statusCodes)].sort((a, b) => a - b), 'confirmed', 'backend source scan', sourceFiles.slice(0, 5))
  const hasMiddlewareError = /use\s*\([^)]*err|ExceptionFilter|@Catch\b|exception_handler|ErrorHandler|recover\s*\(/.test(sources)
  if (hasMiddlewareError) {
    addFact('api.currentErrorPresentation', 'api', {
      globalErrorMiddleware: true,
      returnsUnifiedFailureBody: /json\s*\(|HTTPException|JsonResponse|c\.JSON|jsonify/.test(sources),
      hasDuplicateSuppression: false
    }, 'confirmed', 'backend source scan', sourceFiles.slice(0, 5))
    addFact('api.currentErrorObject', 'api', {
      hasStructuredErrorType: /class\s+\w*Error|type\s+\w*Error|HTTPException|ExceptionFilter/.test(sources),
      returnsStructuredFailure: /json\s*\(|HTTPException|JsonResponse|c\.JSON|jsonify/.test(sources)
    }, 'confirmed', 'backend source scan', sourceFiles.slice(0, 5))
  }
  const guardFile = sourceFiles.find(file => /auth|permission|jwt|session|guard|middleware/i.test(file) && /token|Authorization|Bearer|permission|role|session/i.test(read(file)))
  if (guardFile) addFact('auth.guardEntry', 'security', guardFile, 'confirmed', 'backend auth scan', guardFile)
  return true
}

function scanBackendNonApplicableFacts() {
  const scope = inferProjectScope()
  if (scope !== 'backend') return
  if (!factValue('api.withCredentials')) addFact('api.withCredentials', 'api', '后端入站 API 不适用浏览器 withCredentials 配置', 'not-applicable', 'scope inference', 'project.scope=backend')
  if (!factValue('api.timeoutMs')) addFact('api.timeoutMs', 'api', '后端入站 API 无客户端请求超时；下游调用超时需按具体 client/SDK 确认', 'not-applicable', 'scope inference', 'project.scope=backend')
  if (!factValue('state.library')) addFact('state.library', 'state', '后端项目不使用前端状态管理库', 'not-applicable', 'scope inference', 'project.scope=backend')
  if (!factValue('state.directory')) addFact('state.directory', 'state', factValue('dir.services') || '后端状态由服务端持久化、缓存、事务或消息链路承载', 'not-applicable', 'scope inference', factValue('dir.services') || 'project.scope=backend')
  if (!factValue('auth.storage')) addFact('auth.storage', 'security', '客户端凭证存储不在后端仓库内；后端只读取请求凭证或服务端会话', 'not-applicable', 'scope inference', 'project.scope=backend')
  if (!factValue('auth.tokenKey')) addFact('auth.tokenKey', 'security', '后端不定义浏览器 token key；请求头、cookie 或会话键需按认证入口确认', 'not-applicable', 'scope inference', 'project.scope=backend')
}

function scanApiNonApplicableFacts() {
  const scope = inferProjectScope()
  const hasApiEvidence = Boolean(factValue('api.entry') || factValue('api.library') || factValue('dir.api'))
  if (!hasApiEvidence && scope === 'frontend') {
    addFact('api.entry', 'api', '未检测到 API/request 封装；当前项目可能不发起远程接口调用', 'not-applicable', 'scope inference', 'project.scope=frontend')
    addFact('api.library', 'api', '未检测到请求库或 API client', 'not-applicable', 'dependency/source scan', 'package.json and known API directories')
  }
  if (scope !== 'backend' && !factValue('api.entry')) return
  if (!factValue('api.timeoutMs')) addFact('api.timeoutMs', 'api', '未检测到统一超时配置', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.withCredentials')) addFact('api.withCredentials', 'api', scope === 'backend' ? '后端入站 API 不适用浏览器 withCredentials 配置' : '未检测到统一 withCredentials 配置', scope === 'backend' ? 'not-applicable' : 'needs-confirmation', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.headers')) addFact('api.headers', 'api', '未检测到统一请求头配置', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.successBusinessCode')) addFact('api.successBusinessCode', 'api', '未检测到统一成功业务码', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.handledHttpStatuses')) addFact('api.handledHttpStatuses', 'api', '未检测到显式 HTTP 状态处理', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.currentLogging')) addFact('api.currentLogging', 'api', '未检测到统一 API 错误日志实现', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.currentErrorObject')) addFact('api.currentErrorObject', 'api', '未检测到统一结构化错误对象', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('api.currentErrorPresentation')) addFact('api.currentErrorPresentation', 'api', '未检测到统一错误展示或错误响应处理', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
  if (!factValue('auth.current403Behavior')) addFact('auth.current403Behavior', 'api', '未检测到认证/权限失败统一处理', hasApiEvidence ? 'needs-confirmation' : 'not-applicable', 'source scan', factValue('api.entry') || 'known API entry candidates')
}

function commonParent(files) {
  if (!files.length) return ''
  const parts = files.map(file => file.split('/'))
  const first = parts[0]
  let i = 0
  while (i < first.length - 1 && parts.every(part => part[i] === first[i])) i += 1
  return first.slice(0, i).join('/')
}

function scanApiAndAuth() {
  const candidates = [
    'src/utils/request.js', 'src/utils/request.ts', 'src/utils/http.js', 'src/utils/http.ts', 'src/lib/http.ts',
    'src/api/client.ts', 'src/api/request.ts', 'app/services/http.ts', 'lib/api_client.dart'
  ]
  const entry = firstExisting(candidates, 'file')
  const pkg = readJson('package.json')
  const deps = packageDependencies(pkg)
  const library = deps.axios ? 'Axios' : deps.ky ? 'ky' : deps['node-fetch'] ? 'node-fetch' : entry ? '项目自定义请求封装' : ''
  if (entry) addFact('api.entry', 'api', entry, 'confirmed', 'filesystem', entry)
  if (library) addFact('api.library', 'api', library, 'confirmed', 'dependency/source scan', entry || 'package.json')
  if (!entry) {
    if (library && !factValue('api.entry')) addFact('api.entry', 'api', `未检测到统一请求封装；发现请求库 ${library}，调用点可能分散`, 'needs-confirmation', 'dependency/source scan', 'package.json')
    scanJavaSpringApiAndAuth() || scanGenericBackendApiAndAuth()
    scanBackendNonApplicableFacts()
    scanApiNonApplicableFacts()
    return
  }

  const source = read(entry)
  const timeoutMatch = source.match(/timeout\s*:\s*(\d+)/)
  const withCredentialsMatch = source.match(/withCredentials\s*:\s*(true|false)/)
  const successCodeMatch = source.match(/\.code\s*={2,3}\s*['"]([^'"]+)['"]/) 
  const timeout = timeoutMatch && timeoutMatch[1]
  const withCredentials = withCredentialsMatch && withCredentialsMatch[1]
  const successCode = successCodeMatch && successCodeMatch[1]
  const statusCodes = [...source.matchAll(/status\s*={2,3}\s*(\d{3})/g)].map(match => Number(match[1]))
  const headerNames = [...source.matchAll(/headers\[['"]([^'"]+)['"]\]/g)].map(match => match[1])
  if (timeout) addFact('api.timeoutMs', 'api', Number(timeout), 'confirmed', 'source scan', `${entry}:timeout`)
  if (withCredentials) addFact('api.withCredentials', 'api', withCredentials === 'true', 'confirmed', 'source scan', `${entry}:withCredentials`)
  if (successCode) addFact('api.successBusinessCode', 'api', { value: successCode, type: 'string' }, 'confirmed', 'source scan', `${entry}:response interceptor`)
  if (statusCodes.length) addFact('api.handledHttpStatuses', 'api', [...new Set(statusCodes)], 'confirmed', 'source scan', `${entry}:response interceptor`)
  if (headerNames.length) addFact('api.headers', 'api', [...new Set(headerNames)], 'confirmed', 'source scan', `${entry}:request interceptor`)
  const messageCalls = (source.match(/\bMessage\s*\(|\bMessage\.(?:error|warning|success)\s*\(/g) || []).length
  const currentLogging = {
    consoleCalls: (source.match(/console\.(?:log|error|warn|debug)\s*\(/g) || []).length,
    logsRawResponse: /console\.(?:log|error|warn|debug)[\s\S]{0,160}\b(?:res|response)\b/.test(source),
    logsRawError: /console\.(?:log|error|warn|debug)[\s\S]{0,160}\berror\b/.test(source)
  }
  const currentErrorObject = {
    usesNativeError: /new\s+Error\s*\(/.test(source),
    rejectsRawError: /Promise\.reject\s*\(\s*error\s*\)/.test(source),
    hasStructuredErrorType: /class\s+\w*Error\b|new\s+(?:ApiError|HttpError|AppError)\b/.test(source)
  }
  const currentErrorPresentation = {
    globalMessageCalls: messageCalls,
    hasDuplicateSuppression: /isShowingError|messageShown|dedupe|singleFlight|authFailureHandled/.test(source)
  }
  addFact('api.currentLogging', 'api', currentLogging, 'confirmed', 'source scan', `${entry}:logging`)
  addFact('api.currentErrorObject', 'api', currentErrorObject, 'confirmed', 'source scan', `${entry}:error rejection`)
  addFact('api.currentErrorPresentation', 'api', currentErrorPresentation, 'confirmed', 'source scan', `${entry}:error presentation`)
  const implementationGaps = []
  if (currentLogging.logsRawResponse || currentLogging.logsRawError) implementationGaps.push('日志可能输出完整响应或原始错误，需核对脱敏目标')
  if (!currentErrorObject.hasStructuredErrorType) implementationGaps.push('未检测到统一结构化错误类型')
  if (messageCalls > 1 && !currentErrorPresentation.hasDuplicateSuppression) implementationGaps.push('存在多个全局提示分支，未检测到重复提示抑制机制')
  if (statusCodes.includes(403)) {
    const current403Behavior = {
      clearsCredential: /removeToken|removeCookie|clearToken/.test(source),
      resetsGlobalState: /dispatch\s*\([^)]*reset|commit\s*\([^)]*RESET/i.test(source),
      redirectsToLogin: /(?:replace|push)\s*\([^)]*(?:login|signin)/is.test(source),
      hasSingleFlightGuard: /isRedirecting|authFailureHandled|singleFlight|logoutPromise/.test(source)
    }
    addFact('auth.current403Behavior', 'api', current403Behavior, 'confirmed', 'source scan', `${entry}:HTTP 403 handler`)
    if (!current403Behavior.resetsGlobalState) implementationGaps.push('HTTP 403 当前未重置全局登录状态')
    if (!current403Behavior.hasSingleFlightGuard) implementationGaps.push('HTTP 403 当前缺少并发单次处理保护')
  }
  if (implementationGaps.length) addFact('api.implementationGaps', 'api', implementationGaps, 'confirmed', 'source scan', entry)

  const authFile = firstExisting(['src/utils/auth.js', 'src/utils/auth.ts', 'src/auth.ts', 'app/auth.ts', 'lib/auth.dart'], 'file')
  if (authFile) {
    const authSource = read(authFile)
    const cookieKeyMatch = authSource.match(/TokenKey\s*=\s*['"]([^'"]+)['"]/) 
    const cookieKey = cookieKeyMatch && cookieKeyMatch[1]
    const storage = /Cookies\./.test(authSource) ? 'Cookie' : /localStorage/.test(authSource) ? 'localStorage' : /sessionStorage/.test(authSource) ? 'sessionStorage' : '项目自定义存储'
    addFact('auth.storage', 'security', storage, 'confirmed', 'source scan', authFile)
    if (cookieKey) addFact('auth.tokenKey', 'security', cookieKey, 'confirmed', 'source scan', `${authFile}:TokenKey`)
  }
  const guard = firstExisting(['src/permission.js', 'src/permission.ts', 'src/router/guards.ts', 'src/middleware/auth.ts', 'middleware/auth.ts'], 'file')
  if (guard) addFact('auth.guardEntry', 'security', guard, 'confirmed', 'filesystem', guard)
  scanJavaSpringApiAndAuth()
  scanBackendNonApplicableFacts()
  scanApiNonApplicableFacts()
}

function collectDomainMap(pageDir, apiDir, featureDir, stateDir, componentsDir) {
  const domains = []
  const seen = new Set()
  const pageExt = /\.(jsx?|tsx?|vue|svelte)$/
  const appRouterFileNames = new Set(['page', 'layout', 'template', 'loading', 'error', 'global-error', 'not-found', 'default', 'route'])
  const isAppRouter = pageDir && (pageDir === 'app' || pageDir.endsWith('/app')) && exists(pageDir)
  const isAppRouterSegmentNoise = name => {
    if (!isAppRouter) return false
    if (name === 'api') return true
    return /^\(.+\)$/.test(name) || /^\[.*\]$/.test(name)
  }
  const isAppRouterFileNoise = name => {
    if (!isAppRouter) return false
    const base = name.replace(pageExt, '')
    return appRouterFileNames.has(base)
  }
  const addDomain = (name, root, kind) => {
    const key = `${kind}:${name}`
    if (seen.has(key)) return
    seen.add(key)
    domains.push({ name, root, kind })
  }
  if (featureDir && exists(featureDir)) {
    for (const entry of fs.readdirSync(path.join(ROOT, featureDir), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) addDomain(entry.name, path.join(featureDir, entry.name), 'feature')
    }
  }
  if (pageDir && exists(pageDir)) {
    for (const entry of fs.readdirSync(path.join(ROOT, pageDir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      if (isAppRouterSegmentNoise(entry.name)) continue
      if (entry.isDirectory()) addDomain(entry.name, path.join(pageDir, entry.name), 'page')
      else if (pageExt.test(entry.name) && !isAppRouterFileNoise(entry.name)) addDomain(entry.name.replace(pageExt, ''), path.join(pageDir, entry.name), 'page')
    }
  }
  domains.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)))
  const routeFiles = ['src/router/index.js', 'src/router/index.ts', 'routes/index.js', 'config/routes.js'].filter(exists)
  const routePaths = []
  for (const routeFile of routeFiles) {
    const source = read(routeFile)
    for (const match of source.matchAll(/path\s*:\s*['"](\/[^'"]*)['"]/g)) routePaths.push(match[1])
  }
  const apiFiles = apiDir ? listFiles(apiDir, 3).filter(file => /\.(js|ts|py|go|java|php|rb)$/.test(file)).slice(0, 100) : []
  const storeFiles = stateDir ? listFiles(stateDir, 3).filter(file => pageExt.test(file)).slice(0, 100) : []
  const componentFiles = componentsDir ? listFiles(componentsDir, 3).filter(file => pageExt.test(file)).slice(0, 200) : []

  // Aggregate features, pages and imported APIs/stores/components into impact-surface
  // groups so the rule file can answer "changing this domain touches which files".
  const refsOf = files => files.map(file => ({ file, ref: file.replace(/\.[^.]+$/, '') }))
  const apiRefs = refsOf(apiFiles)
  const storeRefs = refsOf(storeFiles)
  const componentRefs = refsOf(componentFiles)
  const matchRefs = (sources, refs) => [...new Set(refs.filter(({ ref }) => sources.includes(ref)).map(item => item.file))].sort()
  const groups = new Map()
  const ensureGroup = name => {
    if (!groups.has(name)) groups.set(name, { name, feature: null, pages: [], apis: [], stores: [], components: [] })
    return groups.get(name)
  }
  for (const domain of domains) if (domain.kind === 'feature') ensureGroup(domain.name).feature = domain.root
  for (const domain of domains) {
    if (domain.kind !== 'page') continue
    let key = groups.has(domain.name) ? domain.name : ''
    if (!key) for (const name of groups.keys()) {
      if (domain.name.startsWith(`${name}-`) || name.startsWith(`${domain.name}-`)) { key = name; break }
    }
    ensureGroup(key || domain.name).pages.push(domain.root)
  }
  for (const group of groups.values()) {
    const files = []
    if (group.feature) files.push(...listFiles(group.feature, 2))
    files.push(...group.pages)
    group.pages.sort()
    const sources = files.filter(file => pageExt.test(file)).slice(0, 40).map(read).join('\n')
    group.apis = matchRefs(sources, apiRefs)
    group.stores = matchRefs(sources, storeRefs)
    group.components = matchRefs(sources, componentRefs)
  }
  const impact = [...groups.values()]
    .filter(group => (group.feature ? 1 : 0) + (group.pages.length ? 1 : 0) + (group.apis.length ? 1 : 0) + (group.stores.length ? 1 : 0) + (group.components.length ? 1 : 0) >= 2)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Reuse candidates = assets referenced by 2+ domains (structural reuse hotspots).
  const usage = new Map()
  for (const group of groups.values()) {
    for (const [kind, files] of [['component', group.components], ['api', group.apis], ['store', group.stores]]) {
      for (const file of files) {
        if (!usage.has(file)) usage.set(file, { path: file, kind, usedBy: new Set() })
        usage.get(file).usedBy.add(group.name)
      }
    }
  }
  const sharedAssets = [...usage.values()]
    .filter(asset => asset.usedBy.size >= 2)
    .map(asset => ({ path: asset.path, kind: asset.kind, usedBy: [...asset.usedBy].sort() }))
    .sort((a, b) => (b.usedBy.length - a.usedBy.length) || a.path.localeCompare(b.path))

  return { domains, routePaths: [...new Set(routePaths)], apiFiles, routeFiles, impact, sharedAssets }
}

function scanDomains() {
  const pageDir = factValue('dir.pages')
  const apiDir = factValue('dir.api')
  const featureDir = factValue('dir.features')
  const stateDir = factValue('dir.state')
  const componentsDir = factValue('dir.components')
  const domainMap = collectDomainMap(pageDir, apiDir, featureDir, stateDir, componentsDir)
  addFact('domain.map', 'business', { domains: domainMap.domains, routePaths: domainMap.routePaths, apiFiles: domainMap.apiFiles, impact: domainMap.impact, sharedAssets: domainMap.sharedAssets }, domainMap.domains.length || domainMap.routePaths.length || domainMap.apiFiles.length ? 'confirmed' : 'undefined', 'repository structure scan', [featureDir, pageDir, stateDir, componentsDir, ...domainMap.routeFiles, apiDir].filter(Boolean))
  const businessDoc = firstExisting(['BUSINESS_RULES.md', 'docs/business.md', 'docs/business-rules.md', 'docs/domain.md'], 'file')
  if (businessDoc) addFact('business.rulesDocument', 'business', businessDoc, 'confirmed', 'filesystem', businessDoc)
}

function scanAll() {
  scanProjectIdentity()
  scanTechnology()
  scanDirectories()
  scanGit()
  scanCommandsAndTests()
  scanFrontendAndState()
  scanApiAndAuth()
  scanDomains()
}

module.exports = {
  scanProjectIdentity, scanTechnology, inferProjectScope, scanDirectories,
  getGitSnapshot, scanGit, collectTestFiles, scanCommandsAndTests,
  scanFrontendAndState, scanApiAndAuth, collectDomainMap, scanDomains, scanAll
}
