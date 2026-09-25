#!/usr/bin/env bash
# Start AYU: backend API (and the frontend once it exists). Ctrl+C stops everything.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

# --- Backend: create the venv / reinstall only when requirements.txt changes ---
cd "$ROOT/backend"
REQ_HASH="$(shasum requirements.txt | cut -d' ' -f1)"
if [ ! -x .venv/bin/python ] || [ "$(cat .req-hash 2>/dev/null)" != "$REQ_HASH" ]; then
  echo "▸ Installing backend dependencies…"
  if command -v uv >/dev/null 2>&1; then
    [ -x .venv/bin/python ] || uv venv --python 3.11 .venv
    uv pip install --quiet --python .venv/bin/python -r requirements.txt
  else
    PY="$(command -v python3.11 || command -v python3)"
    [ -x .venv/bin/python ] || "$PY" -m venv .venv
    .venv/bin/pip install --quiet -r requirements.txt
  fi
  echo "$REQ_HASH" > .req-hash
fi

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

echo "▸ API        http://127.0.0.1:$API_PORT   (docs: /docs)"
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" &
PIDS+=($!)

# --- Frontend ---
if [ -f "$ROOT/frontend/package.json" ]; then
  cd "$ROOT/frontend"
  [ -d node_modules ] || { echo "▸ Installing frontend dependencies…"; npm install --silent; }
  echo "▸ Dashboard  http://localhost:$WEB_PORT"
  npm run dev -- --port "$WEB_PORT" --strictPort &
  PIDS+=($!)
fi

wait
