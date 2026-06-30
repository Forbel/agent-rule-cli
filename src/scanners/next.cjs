const {
  exists, factValue, readJson, packageDependencies
} = require('../context.cjs')

function hasNextDependency() {
  const deps = packageDependencies(readJson('package.json'))
  return Boolean(deps.next)
}

function hasNextConfig() {
  return ['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts'].some(exists)
}

function isNextProject() {
  return hasNextDependency() || hasNextConfig()
}

function firstExistingActionPath(appRoot) {
  const candidates = [
    'src/server/actions',
    'server/actions',
    'src/lib/actions',
    'lib/actions',
    appRoot ? `${appRoot}/actions.ts` : '',
    appRoot ? `${appRoot}/actions.js` : ''
  ].filter(Boolean)
  return candidates.find(exists) || ''
}

function scan() {
  if (!isNextProject()) return null
  const appRoot = exists('src/app') ? 'src/app' : exists('app') ? 'app' : ''
  const facts = []

  if (appRoot) {
    if (!factValue('dir.pages')) {
      facts.push({
        id: 'dir.pages',
        module: 'architecture',
        value: appRoot,
        status: 'confirmed',
        source: 'Next.js scanner',
        evidence: appRoot,
        note: 'Next.js App Router 页面和布局入口'
      })
    }
    if (!factValue('dir.router')) {
      facts.push({
        id: 'dir.router',
        module: 'architecture',
        value: `${appRoot}（Next.js App Router 文件系统路由）`,
        status: 'confirmed',
        source: 'Next.js scanner',
        evidence: appRoot
      })
    }
    const apiRoot = `${appRoot}/api`
    if (exists(apiRoot) && !factValue('dir.api')) {
      facts.push({
        id: 'dir.api',
        module: 'architecture',
        value: apiRoot,
        status: 'confirmed',
        source: 'Next.js scanner',
        evidence: apiRoot,
        note: 'Next.js route handlers'
      })
    }
  }

  const serverActions = firstExistingActionPath(appRoot)
  if (serverActions && !factValue('dir.serverActions')) {
    facts.push({
      id: 'dir.serverActions',
      module: 'architecture',
      value: serverActions,
      status: 'confirmed',
      source: 'Next.js scanner',
      evidence: serverActions
    })
  }

  return { facts }
}

module.exports = { scan }
