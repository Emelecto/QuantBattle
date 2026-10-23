"""Lecturas públicas acotadas e historial autenticado de experimentos ML."""
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from auth import require_user
import ml_storage as store
import ml_persist as persist
import ml_protocol as protocol
from ml_research import enrich_experiment

router = APIRouter(prefix="/ml", tags=["ml-research"])


@lru_cache(maxsize=2)
def _public_index(path: str, data_hash: str):
    frame = store.download_parquet(path)
    if "target" in frame.columns or not {"id", "era"}.issubset(frame.columns) or not persist.verify_frame_hash(frame, data_hash):
        raise HTTPException(503, "No se pudo verificar el índice público de la ronda")
    return frame[["id", "era"]].astype(str).values.tolist()


@router.get("/datasets/{dataset_id}/rows")
def public_row_index(dataset_id: str):
    from tournaments import get_supabase
    result = get_supabase().table("ml_datasets").select("id,kind,status,score_version,bucket_path,data_hash,version").eq("id", dataset_id).execute()
    if not result.data:
        raise HTTPException(404, "Ronda no encontrada")
    dataset = result.data[0]
    if dataset.get("kind") != "live" or dataset.get("score_version") != protocol.SCORE_VERSION or dataset.get("status") not in ("ready", "closed", "awaiting_labels", "scoring", "scored"):
        raise HTTPException(409, "El índice no está publicado bajo el protocolo actual")
    if not dataset.get("bucket_path") or not dataset.get("data_hash"):
        raise HTTPException(503, "Ronda sin archivo verificable")
    return {"dataset_id": dataset_id, "version": dataset.get("version"),
            "columns": ["id", "era"], "rows": _public_index(dataset["bucket_path"], dataset["data_hash"])}


@router.get("/experiments")
def experiment_history(request: Request, limit: int = Query(10, ge=1, le=20), offset: int = Query(0, ge=0, le=10000), snapshot: str | None = None):
    user_id = require_user(request)
    try:
        anchor = datetime.fromisoformat(snapshot.replace("Z", "+00:00")) if snapshot else datetime.now(timezone.utc)
        if anchor.tzinfo is None or anchor > datetime.now(timezone.utc):
            raise ValueError()
        snapshot = anchor.isoformat()
    except ValueError:
        raise HTTPException(422, "Fecha de paginación inválida") from None
    from tournaments import get_supabase
    sb = get_supabase()
    rows = sb.table("prediction_submissions").select(
        "id,dataset_id,file_path,file_sha256,dataset_version,row_count,status,score,is_selected,submitted_at"
    ).eq("user_id", user_id).lte("submitted_at", snapshot).order("submitted_at", desc=True).order("id", desc=True).range(offset, offset + limit).execute().data or []
    has_more = len(rows) > limit
    rows = rows[:limit]
    if not rows:
        return {"entries": [], "has_more": False, "next_offset": None, "snapshot": snapshot}
    datasets = sb.table("ml_datasets").select(
        "id,tournament_id,round_number,mode,status,closes_at,version,score_version,benchmarks"
    ).in_("id", list({row["dataset_id"] for row in rows})).execute().data or []
    by_dataset = {row["id"]: row for row in datasets}
    tournament_ids = list({row["tournament_id"] for row in datasets})
    tournaments = sb.table("tournaments").select("id,name").in_("id", tournament_ids).execute().data if tournament_ids else []
    by_tournament = {row["id"]: row for row in tournaments or []}
    def enrich(row):
        dataset = by_dataset.get(row["dataset_id"], {})
        return enrich_experiment(row, dataset, by_tournament.get(dataset.get("tournament_id"), {}))
    with ThreadPoolExecutor(max_workers=4) as pool:
        entries = list(pool.map(enrich, rows))
    return {"entries": entries, "has_more": has_more, "next_offset": offset + len(rows) if has_more else None, "snapshot": snapshot}
