"""Precarga de datos OHLCV REALES hacia Supabase Storage (cache de producción).

Descarga velas reales de Binance (crypto) / yfinance (stock) para un conjunto
fijo de símbolos y timeframes, y las sube al bucket 'market-data' de Supabase
Storage como Parquet (si pyarrow está disponible) o JSON. Así los backtests en
producción leen desde Storage en lugar de golpear la API en cada request.

Uso:
    cd C:/Users/ecard/QuantBattle/worker
    . .venv/Scripts/activate
    python scripts/precache.py            # ejecuta la precarga completa
    python -c "from scripts.precache import build_jobs, cache_object_path"

El script es autónomo y tolerante a fallos: si un (símbolo, timeframe) falla
(red, símbolo inexistente, etc.), lo registra y continúa con el siguiente.
NO inventa datos: todo lo que sube proviene de la API real.
"""
from __future__ import annotations

import logging
import os
import sys
import time

# Permite ejecutar como script (python scripts/precache.py) y como módulo.
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from data_feed import (  # noqa: E402
    _cache_path,
    ensure_cache_bucket,
    get_ohlcv,
    write_to_cache,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("precache")

# --- Configuración de la precarga ------------------------------------------
CRYPTO_SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
    "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT",
]
STOCK_SYMBOLS = [
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "SPY",
]
TIMEFRAMES = ["1d", "4h", "1h"]

# Rangos amplios por tipo de activo.
RANGES = {
    "crypto": ("2021-01-01", "2024-12-31"),
    "stock": ("2018-01-01", "2024-12-31"),
}

# Pausa entre descargas para respetar rate-limits de Binance/yfinance.
_REQUEST_PAUSE_S = 0.2


def cache_object_path(asset_type: str, symbol: str, timeframe: str) -> str:
    """Ruta del objeto en el bucket (igual que data_feed._cache_path)."""
    return _cache_path(asset_type, symbol, timeframe)


def build_jobs() -> list[dict]:
    """Devuelve la lista de trabajos de precarga como dicts.

    Cada dict: {asset_type, symbol, timeframe, start, end}.
    """
    jobs: list[dict] = []
    for asset_type, symbols in (("crypto", CRYPTO_SYMBOLS), ("stock", STOCK_SYMBOLS)):
        start, end = RANGES[asset_type]
        for symbol in symbols:
            for tf in TIMEFRAMES:
                jobs.append({
                    "asset_type": asset_type,
                    "symbol": symbol,
                    "timeframe": tf,
                    "start": start,
                    "end": end,
                })
    return jobs


def _run_job(job: dict) -> dict:
    """Descarga un (símbolo, timeframe) y lo sube a cache. Devuelve el resultado."""
    at, sym, tf = job["asset_type"], job["symbol"], job["timeframe"]
    # Forzamos descarga directa (use_cache=False) para no leer datos parciales
    # de un cache previo; luego escribimos el rango completo.
    df = get_ohlcv(at, sym, tf, job["start"], job["end"], use_cache=False)
    ok = write_to_cache(at, sym, tf, df)
    path = cache_object_path(at, sym, tf)
    n = len(df)
    size = (df.memory_usage(deep=True).sum()
            if hasattr(df, "memory_usage") else df.size)
    return {
        "asset_type": at, "symbol": sym, "timeframe": tf,
        "path": path, "n_bars": n, "ok": ok,
    }


def run(verbose: bool = True) -> list[dict]:
    """Ejecuta la precarga completa. Tolera fallos por trabajo.

    Devuelve la lista de resultados (uno por trabajo, exitoso o no).
    """
    ensure_cache_bucket()
    jobs = build_jobs()
    results: list[dict] = []
    total = len(jobs)
    ok_count = 0
    fail_count = 0
    if verbose:
        logger.info("Iniciando precarga: %d trabajos (%d crypto + %d stock) x %d tf.",
                    total, len(CRYPTO_SYMBOLS), len(STOCK_SYMBOLS), len(TIMEFRAMES))
    for i, job in enumerate(jobs, 1):
        at, sym, tf = job["asset_type"], job["symbol"], job["timeframe"]
        try:
            res = _run_job(job)
            ok_count += 1
            if verbose:
                logger.info("[%d/%d] OK   %s %s %s -> %s (%d barras)",
                            i, total, at, sym, tf, res["path"], res["n_bars"])
            results.append({**res, "error": None})
        except Exception as exc:
            fail_count += 1
            msg = str(exc)
            if verbose:
                logger.warning("[%d/%d] FAIL %s %s %s: %s",
                               i, total, at, sym, tf, msg)
            results.append({
                "asset_type": at, "symbol": sym, "timeframe": tf,
                "path": cache_object_path(at, sym, tf),
                "n_bars": 0, "ok": False, "error": msg,
            })
        time.sleep(_REQUEST_PAUSE_S)
    if verbose:
        logger.info("Precarga finalizada: %d OK, %d fallidos, %d total.",
                    ok_count, fail_count, total)
    return results


if __name__ == "__main__":
    run()
