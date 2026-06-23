#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SECTIONS_DIR = path.join(ROOT, 'src', 'sections')
const OUTPUT = path.join(ROOT, 'agent-rules-init.cjs')

const sections = [
  '00-bootstrap.cjs',
  '01-utils.cjs',
  '02-scan.cjs',
  '03-wizard.cjs',
  '04-status-and-files.cjs',
  '05-render.cjs',
  '06-verify.cjs',
  '07-main.cjs'
]

const missing = sections.filter(file => !fs.existsSync(path.join(SECTIONS_DIR, file)))
if (missing.length) {
  process.stderr.write(`缺少源码片段：${missing.join(', ')}\n`)
  process.exit(1)
}

const content = sections
  .map(file => fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8').trimEnd())
  .join('\n\n')

fs.writeFileSync(OUTPUT, `${content}\n`, { mode: 0o755 })
process.stdout.write(`built ${path.relative(ROOT, OUTPUT)} from ${sections.length} source sections\n`)
