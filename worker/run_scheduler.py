"""Entry point CLI para ejecutar el scheduler de torneos QuantLab.

Uso:
    python run_scheduler.py              # Ejecuta --all por defecto
    python run_scheduler.py --create-tournament
    python run_scheduler.py --evaluate
    python run_scheduler.py --all
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

# Añadir el directorio worker al path para imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def get_supabase_client():
    """Crea cliente Supabase desde variables de entorno."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas"
        )
    return create_client(url, key)


def run_create_tournament() -> None:
    """Ejecuta create_weekly_tournament."""
    from scheduler import create_weekly_tournament

    sb = get_supabase_client()
    now = datetime.now(timezone.utc)
    result = create_weekly_tournament(sb, now)
    if result:
        logger.info(f"Torneo creado exitosamente: {result.get('id')}")
    else:
        logger.info("No se creó ningún torneo (posible duplicado)")


def run_evaluate() -> None:
    """Ejecuta evaluate_tournaments."""
    import engine
    from scheduler import evaluate_tournaments

    sb = get_supabase_client()
    now = datetime.now(timezone.utc)
    evaluated = evaluate_tournaments(sb, engine, now)
    logger.info(f"Torneos evaluados: {evaluated}")


def run_create_ml_round() -> None:
    """Crea una ronda de predicciones ML (sintético por defecto)."""
    from ml_scheduler import create_ml_round

    sb = get_supabase_client()
    now = datetime.now(timezone.utc)
    result = create_ml_round(sb, mode="sintetico", now=now, round_days=7,
                             n_activos=600, n_eras=350, n_features=50,
                             n_features_utiles=12, ic_objetivo=0.06)
    if result:
        logger.info(f"Ronda ML creada: {result.get('id')}")
    else:
        logger.info("No se creó ronda ML (posible duplicado reciente)")


def run_evaluate_ml() -> None:
    """Evalúa submissions de rondas ML cerradas; ML no distribuye QP."""
    from ml_scheduler import evaluate_ml_rounds

    sb = get_supabase_client()
    now = datetime.now(timezone.utc)
    evaluados = evaluate_ml_rounds(sb, now)
    logger.info(f"Rondas ML evaluadas: {evaluados}")


def run_all() -> None:
    """Ejecuta el scheduler completo (código + ML)."""
    logger.info("=== Iniciando scheduler completo ===")
    run_create_tournament()
    run_evaluate()
    run_create_ml_round()
    run_evaluate_ml()
    logger.info("=== Scheduler finalizado ===")


def main():
    parser = argparse.ArgumentParser(
        description="Scheduler de torneos QuantLab",
    )
    parser.add_argument(
        "--create-tournament",
        action="store_true",
        help="Crear torneo semanal",
    )
    parser.add_argument(
        "--evaluate",
        action="store_true",
        help="Evaluar torneos cerrados",
    )
    parser.add_argument(
        "--create-ml-round",
        action="store_true",
        help="Crear ronda de predicciones ML (sintético)",
    )
    parser.add_argument(
        "--evaluate-ml",
        action="store_true",
        help="Evaluar submissions de rondas ML cerradas",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        default=True,
        help="Ejecutar todo (crear + evaluar + ML). Comportamiento por defecto.",
    )

    args = parser.parse_args()

    # Si no se especifica ninguna acción, --all por defecto
    if not (args.create_tournament or args.evaluate or args.create_ml_round or args.evaluate_ml):
        args.all = True

    try:
        if args.all:
            run_all()
        else:
            if args.create_tournament:
                run_create_tournament()
            if args.evaluate:
                run_evaluate()
            if args.create_ml_round:
                run_create_ml_round()
            if args.evaluate_ml:
                run_evaluate_ml()
    except Exception as e:
        logger.error(f"Error ejecutando scheduler: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
