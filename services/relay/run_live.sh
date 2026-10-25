#!/bin/sh
# Start the relay on 127.0.0.1:43180 with the live builder enabled.
# Secrets come from services/relay/.env.live (gitignored); nothing is printed.
set -eu
cd "$(dirname "$0")"
if [ -f .env.live ]; then
  set -a
  . ./.env.live
  set +a
fi
export HEAVY_RAIN_LIVE_BUILDER="${HEAVY_RAIN_LIVE_BUILDER:-1}"
export HEAVY_RAIN_BUILDER_MODEL="${HEAVY_RAIN_BUILDER_MODEL:-gemini-3.8-flash}"
exec ../../.venv/bin/python -m relay
