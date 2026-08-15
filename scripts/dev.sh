#!/bin/bash
# Start every PLOP service for local development.
#   PLOP web      http://localhost:5174
#   PLOP API      http://localhost:8100
#   Hive backend  http://localhost:8000
#   Hive UI       http://localhost:3000
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/services/api/.env" ]; then
  echo "Missing services/api/.env — copy .env.example and add your API keys." >&2
  exit 1
fi

echo "→ PLOP API (8100)"
(cd "$ROOT/services/api" && .venv/bin/uvicorn app.main:app --port 8100 &)

echo "→ Hive backend (8000)"
(cd "$ROOT/vendor/hive" && .venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000 &)

echo "→ Hive UI (3000)"
(cd "$ROOT/vendor/hive/frontend" && npm run dev &)

echo "→ PLOP web (5174)"
(cd "$ROOT/apps/web" && npm run dev -- --port 5174 &)

wait
