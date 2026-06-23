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
    'dir.api': ['src/api', 'api', 'src/services', 'services', 'app/services'],
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
  if (!entry) return

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
}

function collectDomainMap(pageDir, apiDir) {
  const domains = []
  if (pageDir && exists(pageDir)) {
    for (const entry of fs.readdirSync(path.join(ROOT, pageDir), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) domains.push({ name: entry.name, pageRoot: path.join(pageDir, entry.name) })
    }
  }
  const routeFiles = ['src/router/index.js', 'src/router/index.ts', 'routes/index.js', 'config/routes.js'].filter(exists)
  const routePaths = []
  for (const routeFile of routeFiles) {
    const source = read(routeFile)
    for (const match of source.matchAll(/path\s*:\s*['"](\/[^'"]*)['"]/g)) routePaths.push(match[1])
  }
  const apiFiles = apiDir ? listFiles(apiDir, 3).filter(file => /\.(js|ts|py|go|java|php|rb)$/.test(file)).slice(0, 100) : []
  return { domains, routePaths: [...new Set(routePaths)], apiFiles, routeFiles }
}

function scanDomains() {
  const pageDir = factValue('dir.pages')
  const apiDir = factValue('dir.api')
  const domainMap = collectDomainMap(pageDir, apiDir)
  addFact('domain.map', 'business', { domains: domainMap.domains, routePaths: domainMap.routePaths, apiFiles: domainMap.apiFiles }, domainMap.domains.length || domainMap.routePaths.length || domainMap.apiFiles.length ? 'confirmed' : 'undefined', 'repository structure scan', [pageDir, ...domainMap.routeFiles, apiDir].filter(Boolean))
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
