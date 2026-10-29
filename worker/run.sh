#!/usr/bin/env bash
# Arranca la API FastAPI del worker de QuantBattle.
#
# Uso:
#   ./run.sh
#   CORS_ORIGINS="http://localhost:3000,https://www.quantbattle.co" ./run.sh
#
# La API queda en 0.0.0.0:8000 (POST /backtest, GET /health, POST /backtest/validate).
# Usa el intérprete del venv directamente para evitar problemas de conversión
# de rutas de MSYS/git-bash en Windows.
set -euo pipefail
cd "$(dirname "$0")"

exec .venv/Scripts/python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
