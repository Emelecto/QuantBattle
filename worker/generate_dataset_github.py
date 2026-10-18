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


def main() -> int:
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
    import ml_prospective
    ml_prospective.resolve_pending_rounds(sb, now)
    round_days = int(os.environ.get("ROUND_DAYS", "7"))
    n_activos = int(os.environ.get("N_ACTIVOS", "600"))
    n_eras = int(os.environ.get("N_ERAS", "350"))
    mode = os.environ.get("ML_ROUND_MODE", "sintetico").strip().lower()
    if mode == "real":
        round_type = os.environ.get("ML_ROUND_TYPE", "historical").strip().lower()
        raw_universe = os.environ.get("ML_REAL_UNIVERSE", "")
        try:
            universe = [tuple(item.strip().split(":", 1)) for item in raw_universe.split(",") if item.strip()]
            if len(universe) < 30 or any(len(item) != 2 or not all(item) for item in universe):
                raise ValueError("ML_REAL_UNIVERSE necesita al menos 30 entradas tipo:símbolo")
        except ValueError:
            logger.exception("Universo real inválido")
            return 1
        if round_type == "prospective":
            if any(asset_type not in ("stock", "etf") for asset_type, _ in universe):
                logger.error("El prospectivo v1 solo admite acciones y ETF diarios")
                return 1
            # Publicación el domingo UTC: último cierre común viernes; plazo
            # de 24 h que termina antes de la próxima apertura estadounidense.
            if now.weekday() != 6:
                logger.info("Prospectivo: hoy no es domingo UTC; solo se maduran rondas")
                return 0
        kwargs = {"universo": universe, "dias": int(os.environ.get("ML_HISTORY_DAYS", "900"))}
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
