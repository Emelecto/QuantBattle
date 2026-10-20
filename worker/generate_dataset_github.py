"""Genera y sube la ronda ML de QuantLab FUERA de Render.

Pensado para correr en GitHub Actions (ubuntu-latest, ~7 GB RAM, no se duerme).
Evita que el worker de Render (plan free, limitado de RAM) genere el dataset
pesado y se reinicie por memoria.

Uso:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATASET_SALT=... \
    python generate_dataset_github.py

El script es idéntico a lo que hace /scheduler/run en el worker para la parte
ML: llama a ml_scheduler.create_ml_round, que crea/encuentra el torneo, calcula
la ronda siguiente y genera+sube el dataset a Supabase Storage.
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("generate_dataset_github")

# Pares USDT spot con historial suficiente y negociación activa. El valor se
# usa cuando no se configura ML_REAL_UNIVERSE; puede sustituirse con pares
# explícitos tipo crypto:BTCUSDT,crypto:ETHUSDT,...
DEFAULT_BINANCE_UNIVERSE = tuple(
    f"crypto:{symbol}" for symbol in (
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
        "SOLUSDT", "TRXUSDT", "LINKUSDT", "LTCUSDT", "BCHUSDT", "DOTUSDT",
        "AVAXUSDT", "ETCUSDT", "XLMUSDT", "ATOMUSDT", "FILUSDT", "NEARUSDT",
        "SHIBUSDT", "UNIUSDT", "AAVEUSDT", "ALGOUSDT", "VETUSDT", "ICPUSDT",
        "SANDUSDT", "MANAUSDT", "GRTUSDT", "ZECUSDT", "COMPUSDT", "CRVUSDT",
        "XTZUSDT", "THETAUSDT", "CHZUSDT", "HBARUSDT", "ARBUSDT", "OPUSDT",
        "INJUSDT", "APTUSDT", "SEIUSDT", "TIAUSDT",
    )
)


def main() -> int:
    # Evita ruido de yfinance en Actions; las rondas ML reales usan Binance Vision.
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        return 1

    # DATASET_SALT es opcional; ml_persist lo deriva del service_role key si falta.
    if not os.environ.get("DATASET_SALT"):
        logger.warning("DATASET_SALT no configurado; ml_persist usara un salt derivado.")

    from supabase import create_client

    sb = create_client(url, key)

    now = datetime.now(timezone.utc)
    round_days = int(os.environ.get("ROUND_DAYS", "7"))
    n_activos = int(os.environ.get("N_ACTIVOS", "600"))
    n_eras = int(os.environ.get("N_ERAS", "350"))
    mode = os.environ.get("ML_ROUND_MODE", "sintetico").strip().lower()
    if mode == "real":
        if os.environ.get("ML_REAL_ROUNDS_APPROVED", "").lower() != "true":
            logger.error("Rondas reales desactivadas: falta aprobar la fuente y su distribución.")
            return 1
        import ml_prospective
        ml_prospective.resolve_pending_rounds(sb, now)
        round_type = os.environ.get("ML_ROUND_TYPE", "historical").strip().lower()
        raw_universe = os.environ.get("ML_REAL_UNIVERSE", "")
        try:
            entries = [item.strip() for item in raw_universe.split(",") if item.strip()]
            if not entries:
                entries = list(DEFAULT_BINANCE_UNIVERSE)
            universe = [tuple(item.split(":", 1)) for item in entries]
            if len(universe) < 30 or any(len(item) != 2 or not all(item) for item in universe):
                raise ValueError("ML_REAL_UNIVERSE necesita al menos 30 entradas crypto:símbolo")
            if any(asset_type != "crypto" for asset_type, _ in universe):
                raise ValueError("ML_REAL_UNIVERSE solo admite crypto:símbolo para Binance Vision")
            symbols = [
                symbol.upper() if symbol.upper().endswith("USDT") else f"{symbol.upper()}USDT"
                for _, symbol in universe
            ]
            if len(set(symbols)) != len(symbols):
                raise ValueError("ML_REAL_UNIVERSE no puede repetir pares")
            universe = [("crypto", symbol) for symbol in symbols]
        except ValueError:
            logger.exception("Universo real inválido")
            return 1
        import data_feed
        try:
            configured_count = len(universe)
            universe = data_feed.filter_binance_vision_spot_universe(universe)
        except ValueError:
            logger.exception("No se pudo validar el universo Binance Vision")
            return 1
        logger.info(
            "Universo Binance Vision activo: %d/%d pares configurados",
            len(universe), configured_count,
        )
        if len(universe) < 30:
            logger.error("Se requieren al menos 30 pares USDT spot activos")
            return 1
        if round_type == "prospective":
            # La ventana de 24 h termina antes de fijar el primer precio base
            # que se usa en el objetivo prospectivo.
            if now.weekday() != 6:
                logger.info("Prospectivo: hoy no es domingo UTC; solo se maduran rondas")
                return 0
        kwargs = {
            "universo": universe,
            "dias": int(os.environ.get("ML_HISTORY_DAYS", "900")),
            "timeframe": "1d",
            "data_source": "binance_vision",
        }
    elif mode == "sintetico":
        round_type = "practice"
        kwargs = {
            "n_activos": n_activos,
            "n_eras": n_eras,
            "n_features": int(os.environ.get("N_FEATURES", "50")),
            "n_features_utiles": int(os.environ.get("N_FEATURES_UTILES", "12")),
            "ic_objetivo": float(os.environ.get("IC_OBJETIVO", "0.06")),
        }
        if os.environ.get("SEED"):
            kwargs["seed"] = int(os.environ["SEED"])
    else:
        logger.error("ML_ROUND_MODE debe ser 'real' o 'sintetico'")
        return 1

    import ml_scheduler

    try:
        live = ml_scheduler.create_ml_round(
            sb,
            mode=mode,
            now=now,
            round_days=round_days,
            round_type=round_type,
            round_hours=24 if round_type == "prospective" else None,
            **kwargs,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Fallo al crear la ronda ML")
        return 1

    if live is None:
        logger.info("Ronda ML ya existe reciente; no se duplico (OK).")
        return 0

    logger.info(f"Ronda ML creada: dataset live {live.get('id')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
