#!/usr/bin/env bash
set -euo pipefail

# scripts/run-vps.sh
# - Systemd/supervisor friendly launcher for production
# - Loads .env, ensures Node 20+, writes structured logs to stdout (JSON by default)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs -r)
fi

export NODE_ENV="${NODE_ENV:-production}"
export LOG_PRETTY="${LOG_PRETTY:-false}"
export HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-9090}"

if ! command -v node >/dev/null 2>&1; then
  echo "[run-vps] node not found. Please install Node.js 20+." >&2
  exit 1
fi

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "[run-vps] Node.js >= 20 required. Current: $(node -v)" >&2
  exit 1
fi

echo "[run-vps] starting JIT bot (NODE_ENV=${NODE_ENV}, HEALTHCHECK_PORT=${HEALTHCHECK_PORT}, LOG_PRETTY=${LOG_PRETTY})"
# Build if dist is missing
if [[ ! -d "dist" ]]; then
  echo "[run-vps] dist/ missing — building..."
  npm run build
fi

# Exec to allow systemd to track the process
exec node dist/index.js
