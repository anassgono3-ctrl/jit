#!/usr/bin/env bash
set -euo pipefail
# Thin wrapper that forwards to the Node runner (cross-platform friendly).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "[run-vps.sh] Node.js not found; please install Node.js 20+." 1>&2
  exit 1
fi
exec node "$DIR/run-vps.js"
