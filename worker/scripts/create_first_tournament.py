"""Crea el primer torneo ML de QuantBattle (modo sintetico) disparando create_ml_round.

Esto es lo mismo que hace el cron /scheduler/run cada 2 dias, pero ejecutado
una vez bajo demanda para sembrar el primer torneo + su ronda/dataset.

Uso:
  cd worker
  export SUPABASE_URL=...        # mismas credenciales del worker en Render
  export SUPABASE_SERVICE_ROLE_KEY=...
  .venv/Scripts/python.exe scripts/create_first_tournament.py

El script es IDEMPOTENTE: si ya existe una ronda ML reciente (mismo modo en los
ultimos `round_days`), create_ml_round devuelve None y no duplica.

NO es DDL: no crea tablas, solo inserta filas usando la logica ya existente.
"""
from __future__ import annotations

import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("create_first_tournament")

# Asegura poder importar modulos del worker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error(
            "Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n"
            "Establecelas con las mismas credenciales del worker en Render y reintenta."
        )
        sys.exit(2)

    import ml_scheduler  # noqa: E402
    from db import get_supabase  # noqa: E402

    sb = get_supabase()
    logger.info("Cliente Supabase listo. Creando ronda ML sintetica...")

    live = ml_scheduler.create_ml_round(
        sb,
        mode="sintetico",
        round_days=4,
        n_activos=600,
        n_eras=350,
        n_features=50,
        n_features_utiles=12,
        ic_objetivo=0.06,
        seed=42,
    )

    if live is None:
        logger.info(
            "No se creo (probablemente ya existe una ronda ML reciente). "
            "Revisa la tabla tournaments (slug='ml-sintetico') y ml_datasets."
        )
        return

    logger.info(f"OK — Torneo 'ml-sintetico' + ronda #{live.get('round_number')} creada.")
    logger.info(f"Dataset live id: {live.get('id')}")
    logger.info("Los participantes pueden enviar predicciones al endpoint POST /ml/datasets/{id}/predictions")


if __name__ == "__main__":
    main()
