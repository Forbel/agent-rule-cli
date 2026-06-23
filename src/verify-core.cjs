function calculateManifestModule(module, manifest, options) {
  const { COVERAGE_CATALOG, BUSINESS_CONTRACT_FACTS } = options
  const stored = manifest.modules && manifest.modules[module]
  if (stored && stored.status === 'ignored') return { status: 'ignored', missing: [], coverage: [], dimensions: { strategy: 'ignored', repositoryFacts: 'ignored', businessContracts: 'ignored' } }
  const factMap = new Map((manifest.facts || []).map(item => [item.id, item]))
  const coverage = (COVERAGE_CATALOG[module] || []).map(([id, label, factIds]) => {
    const missingFacts = factIds.filter(factId => {
      const item = factMap.get(factId)
      return !item || !['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
    })
    return { id, label, factIds, status: missingFacts.length ? 'missing' : 'covered', missingFacts }
  })
  const missing = coverage.filter(item => item.status === 'missing').map(item => item.id)
  const strategyCoverage = coverage.filter(item => item.factIds.some(id => id.startsWith('policy.')))
  const strategy = strategyCoverage.length ? (strategyCoverage.some(item => item.status === 'missing') ? 'partial' : 'configured') : 'not-applicable'
  const repositoryFacts = (manifest.facts || []).filter(item => item.module === module && item.source !== 'wizard')
  const repositoryStatus = !repositoryFacts.length ? 'not-found' : repositoryFacts.every(item => item.status === 'confirmed') ? 'confirmed' : 'partial'
  const contractIds = BUSINESS_CONTRACT_FACTS[module] || []
  const businessContracts = !contractIds.length ? 'not-applicable' : contractIds.every(id => {
    const item = factMap.get(id)
    return item && ['confirmed', 'user-confirmed', 'not-applicable'].includes(item.status)
  }) ? 'confirmed' : 'partial'
  return { status: missing.length ? 'partial' : 'configured', missing, coverage, dimensions: { strategy, repositoryFacts: repositoryStatus, businessContracts } }
}

module.exports = { calculateManifestModule }
