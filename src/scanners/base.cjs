const { addFact } = require('../context.cjs')

function applyScannerResult(result) {
  if (!result || !Array.isArray(result.facts)) return
  for (const item of result.facts) {
    addFact(item.id, item.module, item.value, item.status, item.source, item.evidence, item.note)
  }
}

module.exports = { applyScannerResult }
