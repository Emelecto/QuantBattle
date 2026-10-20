"""Maduración de objetivos de rondas prospectivas con datos de mercado.

La ventana de envío dura 24 h. El precio base es el primer cierre diario común
posterior al plazo; el objetivo compara ese precio con cinco cierres completos
posteriores. Así el período medido empieza después de cerrar los envíos.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

import data_feed
import ml_persist
import ml_storage as storage

logger = logging.getLogger(__name__)
HORIZON_ERAS = 5


def resolve_round(supabase, round_row: dict, now: datetime | None = None) -> bool:
    """Devuelve True al sellar targets; False si todavía faltan fechas."""
    now = now or datetime.now(timezone.utc)
    if round_row.get("round_type") != "prospective":
        raise ValueError("La ronda no es prospectiva")
    if round_row.get("target_hash"):
        return False
    mapping_path = round_row.get("mapping_path")
    if not mapping_path or not round_row.get("mapping_hash"):
        raise ValueError("La ronda no tiene mapeo privado verificable")
    mapping = storage.download_private_parquet(mapping_path)
    if not ml_persist.verify_frame_hash(mapping, round_row["mapping_hash"]):
        raise ValueError("Hash del mapeo privado inválido")
    required = {"row_id", "era", "asset_type", "symbol", "as_of_date", "as_of_close"}
    if not required.issubset(mapping.columns) or mapping.empty:
        raise ValueError("Mapeo privado incompleto")
    dates = mapping["as_of_date"].unique()
    if len(dates) != 1:
        raise ValueError("La ronda prospectiva debe usar una fecha común")
    as_of = pd.Timestamp(dates[0]).date()
    if as_of >= now.date():
        return False
    deadline_text = round_row.get("closes_at")
    if not deadline_text:
        raise ValueError("La ronda prospectiva no tiene plazo de cierre")
    deadline = datetime.fromisoformat(deadline_text.replace("Z", "+00:00"))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if now <= deadline:
        return False
    params = round_row.get("params") or {}
    data_source = params.get("data_source")

    # No usar caché: al crear la ronda ese caché acababa en as_of.
    series: dict[str, pd.Series] = {}
    for asset_index, row in enumerate(mapping.itertuples(index=False)):
        frame = data_feed.get_ohlcv(
            row.asset_type, row.symbol, "1d",
            pd.Timestamp(as_of - timedelta(days=2), tz="UTC"),
            pd.Timestamp(now.date() + timedelta(days=1), tz="UTC"),
            use_cache=False,
            adjusted_close=row.asset_type in ("stock", "etf"),
            source=data_source,
        )
        close = frame["close"].astype(float).copy()
        close.index = pd.to_datetime(close.index, utc=True).date
        if as_of not in close.index:
            logger.warning("Falta precio base para activo %d", asset_index)
            return False
        if not math.isclose(float(close.loc[as_of]), float(row.as_of_close), rel_tol=1e-3):
            raise ValueError(f"Precio base revisado para activo {asset_index}; requiere revisión")
        series[row.symbol] = close

    common = set.intersection(*(set(close.index) for close in series.values()))
    # Índice diario = apertura UTC; el cierre de la vela ocurre a medianoche
    # del día siguiente. Solo cuenta como base si ese cierre es posterior al
    # deadline, y el target usa cinco cierres adicionales después de la base.
    after_deadline = sorted(
        date for date in common
        if as_of < date
        and pd.Timestamp(date, tz="UTC") + pd.Timedelta(days=1) > pd.Timestamp(deadline)
        and pd.Timestamp(date, tz="UTC") + pd.Timedelta(days=1) <= pd.Timestamp(now)
    )
    if len(after_deadline) < HORIZON_ERAS + 1:
        logger.info("Ronda %s pendiente: %s/%s cierres después del plazo", round_row["id"],
                    max(0, len(after_deadline) - 1), HORIZON_ERAS)
        return False
    base_date = after_deadline[0]
    settle_date = after_deadline[HORIZON_ERAS]
    raw = np.array([
        float(series[row.symbol].loc[settle_date])
        / float(series[row.symbol].loc[base_date]) - 1
        for row in mapping.itertuples(index=False)
    ], dtype=float)
    if not np.isfinite(raw).all() or len(set(raw)) < 2:
        raise ValueError("El target prospectivo no es finito o no discrimina activos")
    ranked = pd.Series(raw).rank(pct=True)
    target = np.floor(ranked * 5).clip(0, 4) / 4
    targets = pd.DataFrame({
        "row_id": mapping["row_id"].astype(str).to_numpy(),
        "era": mapping["era"].astype(str).to_numpy(),
        "target": target.astype(float).to_numpy(),
    })
    digest = ml_persist.frame_hash(targets)
    path = round_row["target_path"]
    try:
        existing = storage.download_private_parquet(path)
    except Exception:
        storage.upload_private_parquet(targets, path)
    else:
        if not ml_persist.verify_frame_hash(existing, digest):
            raise ValueError("El holdout existente difiere del cálculo actual")
    if not ml_persist.verify_frame_hash(storage.download_private_parquet(path), digest):
        raise ValueError("El holdout subido no coincide con su hash")
    status = "closed" if deadline <= now else "ready"
    supabase.table("ml_datasets").update({
        "target_hash": digest,
        "target_available_at": now.isoformat(),
        "status": status,
    }).eq("id", round_row["id"]).execute()
    logger.info("Ronda %s madurada con cierre de precios %s", round_row["id"], settle_date)
    return True


def resolve_pending_rounds(supabase, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    rows = supabase.table("ml_datasets").select(
        "id,round_type,mapping_path,mapping_hash,target_path,target_hash,"
        "closes_at,status,params"
    ).eq("kind", "live").eq("round_type", "prospective").in_(
        "status", ["ready", "closed", "awaiting_labels"]
    ).execute().data or []
    resolved = 0
    failures = []
    for row in rows:
        if row.get("target_hash"):
            continue
        try:
            resolved += bool(resolve_round(supabase, row, now))
        except Exception:
            logger.exception("No se pudo madurar la ronda %s", row["id"])
            failures.append(row["id"])
    if failures:
        raise RuntimeError(f"Falló la maduración de rondas ML: {', '.join(failures)}")
    return resolved
