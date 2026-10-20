"""Tareas del scheduler para torneos ML (modelo Numerai).

Se suman al scheduler existente sin tocar los flujos de código. El nuevo flujo
usa predicciones sobre datasets obfuscados; el de código (submissions) queda
como está (aunque el frontend lo retirará).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import ml_protocol as protocol

logger = logging.getLogger(__name__)


def create_ml_round(supabase_client, mode: str = "sintetico", now: datetime | None = None,
                    round_days: int = 7, round_type: str | None = None,
                    round_hours: int | None = None, **gen_kwargs) -> dict | None:
    """Crea una ronda de predicciones ML (dataset sintético o real).

    Cadencia rápida (decisión de Emilio): rondas cortas de `round_days` días.
    Si ya hay una ronda abierta reciente, no duplica.
    """
    now = now or datetime.now(timezone.utc)
    round_type = round_type or ("practice" if mode == "sintetico" else "historical")
    if mode == "real":
        if os.environ.get("ML_REAL_ROUNDS_APPROVED", "").lower() != "true":
            raise ValueError("Publicación real desactivada hasta aprobar la fuente y su distribución")
        if gen_kwargs.get("data_source") != "binance_vision":
            raise ValueError("Las rondas ML reales deben usar Binance Vision.")
        universe = gen_kwargs.get("universo") or []
        if len(universe) < 30 or any(asset_type != "crypto" for asset_type, _ in universe):
            raise ValueError("Binance Vision requiere al menos 30 pares crypto spot.")
        if gen_kwargs.get("timeframe", "1d") != "1d":
            raise ValueError("Las rondas Binance Vision usan velas diarias (1d).")
    if round_type == "prospective" and (round_hours is None or not 1 <= round_hours <= 24):
        raise ValueError("Una ronda prospectiva requiere un plazo explícito de 1 a 24 horas")
    duration = timedelta(hours=round_hours) if round_type == "prospective" else timedelta(days=round_days)
    closes_at = (now + duration).isoformat()
    tournament_asset_type = "synthetic" if mode == "sintetico" else "crypto"
    rules_text = (
        "Predice el rango de retorno futuro por activo. Un CSV id,prediction entre 0 y 1; "
        "solo el último envío válido antes del cierre compite. Score: media de Spearman "
        "por era, calculada después del cierre. Ninguna ronda de predicciones ML otorga QP."
    )
    if mode == "real":
        rules_text += (
            " Datos diarios de Binance Vision. Los datasets derivados se distribuyen bajo "
            "CC BY-NC-SA 4.0, con atribución a Binance Vision y para uso no comercial."
        )
    pending = (
        supabase_client.table("ml_datasets")
        .select("id")
        .eq("kind", "live")
        .eq("round_type", round_type)
        .eq("mode", mode)
        .eq("score_version", protocol.SCORE_VERSION)
        .in_("status", ["ready", "awaiting_labels", "scoring"])
        .execute()
    )
    if pending.data:
        logger.info("Ronda ML anterior aún activa; se omite creación.")
        return None
    recent = (
        supabase_client.table("ml_datasets")
        .select("id")
        .eq("kind", "live")
        .eq("round_type", round_type)
        .eq("mode", mode)
        .eq("score_version", protocol.SCORE_VERSION)
        .in_("status", ["closed", "scored"])
        # La cadencia semanal no debe saltarse una semana si el último job se
        # demoró unos minutos: libera la siguiente ventana tras seis días.
        .gte("created_at", (now - timedelta(days=max(0.5, round_days - 1))).isoformat())
        .execute()
    )
    if recent.data:
        logger.info("Ronda ML ya existe reciente, se omite creación.")
        return None

    # Torneo contenedor (uno por modo, reutilizado). Lo creamos si falta.
    torneo = supabase_client.table("tournaments").select("id").eq(
        "slug", f"ml-{round_type}"
    ).execute()
    if torneo.data:
        tid = torneo.data[0]["id"]
        supabase_client.table("tournaments").update({
            "asset_type": tournament_asset_type,
            "submission_deadline": closes_at,
            "primary_metric": protocol.SCORE_VERSION,
            "prize_pool_qp": 0,
            "rules_text": rules_text,
        }).eq("id", tid).execute()
    else:
        res = supabase_client.table("tournaments").insert({
            "name": f"Torneo ML · {round_type}",
            "slug": f"ml-{round_type}",
            "type": "ml",
            "status": "open",
            "asset_type": tournament_asset_type,
            "symbols": [],
            "timeframe": "1d",
            "data_start": str((now - timedelta(days=400)).date()),
            "data_end": str(now.date()),
            "eval_end": str(now.date()),
            "submission_deadline": closes_at,
            "prize_pool_qp": 0,
            "primary_metric": protocol.SCORE_VERSION,
            "min_trades": 0,
            "max_slippage_pct": 0.005,
            "rules_text": rules_text,
        }).execute()
        tid = res.data[0]["id"]

    # Número de ronda
    last = supabase_client.table("ml_datasets").select("round_number").eq(
        "tournament_id", tid
    ).order("round_number", desc=True).limit(1).execute()
    ronda = (last.data[0]["round_number"] + 1) if last.data else 1

    import ml_persist
    live = ml_persist.crear_dataset(
        tid, ronda, mode=mode, round_type=round_type,
        closes_at=closes_at, now=now, **gen_kwargs
    )
    logger.info(f"Ronda ML {mode} #{ronda} creada (dataset live {live['id']}).")
    return live


def evaluate_ml_rounds(supabase_client, now: datetime | None = None) -> int:
    """Cierra y finaliza rondas v1. Reintentable sin duplicar premios."""
    now = now or datetime.now(timezone.utc)
    live_ds = (
        supabase_client.table("ml_datasets")
        .select("id,tournament_id,round_number,closes_at,status,score_version,"
                "target_available_at,scoring_started_at,round_type,target_hash,params")
        .eq("kind", "live")
        .in_("status", ["ready", "closed", "awaiting_labels", "scoring"])
        .execute()
    )
    evaluados = 0
    failures = []
    for ds in live_ds.data or []:
        if ds.get("score_version") != protocol.SCORE_VERSION:
            # Las rondas antiguas usaban score visible durante el plazo. No se
            # reinterpretan ni se acreditan nuevamente bajo reglas nuevas.
            continue
        try:
            if _finalize_v1_round(supabase_client, ds, now):
                evaluados += 1
        except Exception:
            logger.exception("Ronda ML %s no finalizada; se reintentará", ds["id"])
            failures.append(ds["id"])
    if failures:
        raise RuntimeError(f"Falló la finalización de rondas ML: {', '.join(failures)}")
    return evaluados


def _finalize_v1_round(supabase_client, ds: dict, now: datetime) -> bool:
    from ml_persist import puntuar_submission_en_bd

    if ds.get("status") not in ("ready", "closed", "awaiting_labels", "scoring"):
        return False

    deadline = ds.get("closes_at")
    if not deadline or datetime.fromisoformat(deadline.replace("Z", "+00:00")) > now:
        return False
    if ds.get("round_type") == "prospective" and not ds.get("target_hash"):
        if ds["status"] != "awaiting_labels":
            supabase_client.table("ml_datasets").update({
                "status": "awaiting_labels"
            }).eq("id", ds["id"]).eq("status", ds["status"]).execute()
        return False
    available = ds.get("target_available_at")
    if available and datetime.fromisoformat(available.replace("Z", "+00:00")) > now:
        if ds["status"] != "awaiting_labels":
            supabase_client.table("ml_datasets").update({
                "status": "awaiting_labels"
            }).eq("id", ds["id"]).eq("status", ds["status"]).execute()
        return False

    # Un UPDATE condicional reclama la ronda. Un worker que cae durante scoring
    # deja un lease recuperable después de 30 minutos.
    if ds["status"] == "scoring":
        started = ds.get("scoring_started_at")
        if started and datetime.fromisoformat(started.replace("Z", "+00:00")) > now - timedelta(minutes=30):
            return False
        claim = supabase_client.table("ml_datasets").update({
            "scoring_started_at": now.isoformat()
        }).eq("id", ds["id"]).eq("status", "scoring")
        if started:
            claim = claim.eq("scoring_started_at", started)
        claimed = claim.execute()
    else:
        claimed = supabase_client.table("ml_datasets").update({
            "status": "scoring", "scoring_started_at": now.isoformat()
        }).eq("id", ds["id"]).eq("status", ds["status"]).execute()
    if not claimed.data:
        return False

    submissions = supabase_client.table("prediction_submissions").select(
        "id,user_id,status,score,submitted_at,is_valid"
    ).eq("dataset_id", ds["id"]).eq("is_selected", True).execute().data or []
    for sub in submissions:
        if sub["status"] != "scored":
            puntuar_submission_en_bd(sub["id"])
    scored = supabase_client.table("prediction_submissions").select(
        "id,user_id,score,submitted_at"
    ).eq("dataset_id", ds["id"]).eq("is_selected", True).eq(
        "status", "scored"
    ).eq("is_valid", True).execute().data or []
    if len(scored) != len(submissions):
        raise RuntimeError("No todos los envíos seleccionados fueron puntuados")

    # Dos referencias transparentes, calculadas únicamente tras el cierre.
    # No influyen en el ranking y permiten interpretar el score de una ronda.
    try:
        import hashlib
        import pandas as pd
        import ml_storage as storage
        import ml_persist

        complete = supabase_client.table("ml_datasets").select(
            "bucket_path,target_path,version,round_type"
        ).eq("id", ds["id"]).execute().data[0]
        live = storage.download_parquet(complete["bucket_path"])
        targets = storage.download_private_parquet(complete["target_path"])
        random_values = [
            int(hashlib.sha256(f"{complete['version']}|{row_id}".encode()).hexdigest()[:13], 16)
            / float(0xfffffffffffff)
            for row_id in live["id"].astype(str)
        ]
        minimum = 1 if ds.get("round_type") == "prospective" else 10
        benchmark_scores = {
            "random": protocol.score_predictions(
                pd.DataFrame({"id": live["id"], "prediction": random_values}),
                targets, min_eras=minimum,
            )["score"],
        }
        feature = next((column for column in live.columns if column.startswith("feature_")), None)
        if feature:
            benchmark_scores[feature] = protocol.score_predictions(
                pd.DataFrame({"id": live["id"], "prediction": live[feature]}),
                targets, min_eras=minimum,
            )["score"]
        supabase_client.table("ml_datasets").update({
            "benchmarks": benchmark_scores
        }).eq("id", ds["id"]).execute()
    except Exception:
        logger.exception("No se pudieron calcular referencias para %s", ds["id"])

    # El proveedor elegido licencia los datos y derivados solo para usos no
    # comerciales; los torneos ML no distribuyen QP, aunque una fila antigua
    # tenga un prize_pool_qp distinto de cero.

    supabase_client.table("ml_datasets").update({
        "status": "scored", "finalized_at": now.isoformat()
    }).eq("id", ds["id"]).eq("status", "scoring").execute()
    return True


def _build_consensus_signal(supabase_client, dataset_id: str):
    """Construye la señal comunitaria de la ronda sin repartir recompensas."""
    import numpy as np
    import pandas as pd
    import ml_persist
    import scoring_ml as sc

    # --- Meta-modelo comunitario: se construye SOLO con subs score>0 ---
    preds_df = ml_persist.cargar_predicciones_validas(supabase_client, dataset_id)
    meta = None
    if not preds_df.empty:
        # scores desde BD para descartar subs no aportantes (score <= 0)
        score_rows = (
            supabase_client.table("prediction_submissions")
            .select("id,score")
            .eq("dataset_id", dataset_id)
            .eq("is_valid", True)
            .execute()
        )
        score_map = {r["id"]: (r.get("score") or 0) for r in (score_rows.data or [])}
        cols_validas = [c for c in preds_df.columns if score_map.get(c, 0) > 0]
        if cols_validas:
            # pesos = softmax de los scores: más score -> más peso en el meta-modelo
            s = np.asarray([score_map[c] for c in cols_validas], dtype=float)
            e = np.exp(s - s.max())
            pesos = pd.Series(e / e.sum(), index=cols_validas)
            meta = sc.stake_weight(preds_df[cols_validas], pesos)

    # --- Persistir el meta-modelo comunitario como SEÑAL VIVA del marketplace ---
    # Se guarda en consensus_signals (upsert por (tournament_id, round_number)) para
    # que el endpoint /marketplace/consensus-signal lo exponga. Si la migración 0013
    # aún no está aplicada, no rompemos el flujo de la ronda: logueamos y seguimos.
    if meta is not None and len(meta) > 0:
        try:
            ds_meta = (
                supabase_client.table("ml_datasets")
                .select("tournament_id,round_number,params")
                .eq("id", dataset_id)
                .execute()
            )
            if ds_meta.data:
                info = ds_meta.data[0]
                data_source = (info.get("params") or {}).get("data_source")
                if data_source == "binance_vision":
                    logger.info(
                        "No se publica la señal de %s en el marketplace por la licencia de datos.",
                        dataset_id,
                    )
                else:
                    supabase_client.table("consensus_signals").upsert({
                        "tournament_id": info.get("tournament_id"),
                        "round_number": info.get("round_number"),
                        "dataset_id": dataset_id,
                        "signal_json": meta.to_dict(),
                    }, on_conflict="tournament_id,round_number").execute()
                    logger.info(
                        f"Meta-modelo comunitario persistido en consensus_signals "
                        f"(torneo {info.get('tournament_id')}, ronda {info.get('round_number')}): "
                        f"{len(meta)} señales)."
                    )
        except Exception as e:  # noqa: BLE001
            logger.warning(
                f"No se pudo guardar consensus_signals (¿migración 0013 no aplicada?): {e}"
            )

    # --- Re-puntuar cada submission con el meta-modelo alineado por índice ---
    subs_validas = (
        supabase_client.table("prediction_submissions")
        .select("id")
        .eq("dataset_id", dataset_id)
        .eq("is_valid", True)
        .execute()
    )
    for sub in (subs_validas.data or []):
        ml_persist.puntuar_submission_en_bd(sub["id"], meta_modelo=meta)

    logger.info("Señal comunitaria construida para dataset %s; sin premios QP.", dataset_id)
