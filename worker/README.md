# QuantBattle Worker API

Worker de backtesting OOS con datos reales (Binance para crypto, yfinance para
acciones). Expone el motor validado `engine.run_backtest` vía FastAPI.

## Endpoints

| Método | Ruta                | Cuerpo            | Respuesta |
|--------|---------------------|-------------------|-----------|
| GET    | `/health`           | —                 | `{"status": "ok"}` (sin red) |
| POST   | `/backtest`         | `StrategyConfig`  | dict del motor: `metrics`, `integrity_label`, `equity_curve`, `folds_used`, `n_bars` |
| POST   | `/backtest/validate`| `StrategyConfig`  | `{"valid": bool, "warnings": [...]}` |

`StrategyConfig` (`schemas.py`):
`code, asset_type ("crypto"|"stock"), symbol, timeframe, capital, commission, folds, split, start, end`.

### Comportamiento de errores
- Si la descarga de datos falla (red caída o símbolo inexistente) el motor lanza
  `ValueError`; `/backtest` lo captura y responde **400** con `{"error": "<mensaje claro>"}`.
- Otros errores inesperados responden **500** con `{"error": "..."}`.

### CORS
Cerrado por defecto. Define `CORS_ORIGINS` con una lista separada por comas:
`CORS_ORIGINS="http://localhost:3000,https://www.quantbattle.co"`.
La configuración actual también reconoce previews HTTPS de Vercel; todos los
endpoints de escritura mantienen su autenticación propia.

### Torneos ML y evaluación del semillero

Consultar [el README general](../README.md), [el protocolo](../docs/ml-tournaments.md)
y [la guía de evaluación](../docs/evaluation-guide.md). El piloto publicado usa
datos sintéticos y servicios reales. Las rondas reales están desactivadas por
defecto y los torneos ML no distribuyen QP.

## Arranque

```bash
# Con el script (usa el venv directamente, evita problemas de rutas en MSYS/Windows):
./run.sh

# O manualmente:
.venv/Scripts/python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

La API queda en `http://0.0.0.0:8000`. Docs interactivas en `/docs`.

## Ejemplo de llamada

```bash
curl -X POST http://localhost:8000/backtest \
  -H "Content-Type: application/json" \
  -d '{"code":"sma_btc","asset_type":"crypto","symbol":"BTCUSDT","timeframe":"1d","start":"2023-01-01","end":"2023-01-31","folds":5,"split":70}'
```

## Tests

```bash
.venv/Scripts/python.exe -m pytest tests/ -v
```

Los tests de `/backtest` reales requieren conexión a internet (Binance). Si la red
no responde, fallan explícitamente con el error real en lugar de inventar datos.

## Dependencias

`requirements.txt` (incluye `fastapi`, `uvicorn`, `httpx`, `pydantic`, `pandas`,
`numpy`, `vectorbt`, `requests`, `yfinance`). El venv no se sube a git (`.gitignore`).
