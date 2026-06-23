#!/usr/bin/env node

require('./src/cli.cjs').main().catch(error => {
  process.stderr.write(`错误：${error.message}\n`)
  process.exitCode = 1
})
