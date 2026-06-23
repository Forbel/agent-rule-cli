#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  printf '错误：规则初始化器需要 Node.js 运行时。请安装 Node.js 12 或更高版本。\n' >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 12 ]; then
  printf '错误：当前 Node.js 版本过低，需要 Node.js 12 或更高版本。\n' >&2
  exit 1
fi

exec node "$SCRIPT_DIR/agent-rules-init.cjs" "$@"
