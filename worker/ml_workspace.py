"""Lecturas públicas acotadas e historial autenticado de experimentos ML."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from auth import require_user
from ml_research import enrich_experiment

router = APIRouter(prefix="/ml", tags=["ml-research"])


@router.get("/datasets/{dataset_id}/rows")
def public_row_index(dataset_id: str):
    raise HTTPException(410, "Este dataset fue retirado y ya no está disponible.")


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
