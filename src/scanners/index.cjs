const { applyScannerResult } = require('./base.cjs')
const next = require('./next.cjs')

const SCANNERS = [
  { name: 'next', stages: ['directories'], scanner: next }
]

function runScannerAdapters(stage) {
  for (const entry of SCANNERS) {
    if (!entry.stages.includes(stage)) continue
    applyScannerResult(entry.scanner.scan())
  }
}

module.exports = { runScannerAdapters }
