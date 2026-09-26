#!/usr/bin/env bash
# Build the app and serve it from the API on one address (port 8000) — for a public tunnel,
# a phone on the same Wi-Fi, or anything that should see the production build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
( cd frontend && [ -d node_modules ] || npm install --silent; cd "$ROOT/frontend" && VITE_API_URL= npm run build )
cd backend
[ -x .venv/bin/python ] || { echo "Run ./run.sh once first to set up the backend"; exit 1; }
echo "▸ AYU on http://localhost:${API_PORT:-8000}  (and http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1):${API_PORT:-8000} on this Wi-Fi)"
exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "${API_PORT:-8000}"
