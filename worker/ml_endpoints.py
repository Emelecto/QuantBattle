"""Endpoints de torneos ML (modelo Numerai: el usuario sube PREDICCIONES).

Rutas (prefijo /ml):
  GET  /ml/datasets?tournament_id=&round=   -> lista datasets públicos (metadatos + URLs)
  GET  /ml/datasets/{id}/download?kind=     -> URL del parquet (train/validation/live)
  POST /ml/datasets/{id}/predictions        -> sube CSV (id,prediction), valida, guarda
  GET  /ml/predictions/mine?dataset_id=      -> estado y score de mi envío
  GET  /ml/leaderboard?dataset_id=           -> ranking de la ronda

Ningún endpoint expone dataset_targets (el holdout). El scoring lo hace el cron.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import uuid

import pandas as pd
from fastapi import APIRouter, HTTPException, Request, UploadFile

import os
import math
from datetime import datetime, timezone
from auth import require_user
import ml_storage as store
import ml_persist as persist
import ml_protocol as protocol
import ml_research as research

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ml-tournaments"])

# Tope de CSV aceptado (se rechaza por Content-Length con 413 antes de parsear).
_MAX_CSV_BYTES = protocol.MAX_CSV_BYTES


def _rechazar_si_muy_grande(request: Request) -> None:
    """Rechaza con 413 si Content-Length supera el tope, antes de leer/parsear."""
    cl = request.headers.get("content-length")
    if cl is None:
        return
    try:
        if int(cl) > _MAX_CSV_BYTES:
            raise HTTPException(413, "predicciones demasiado grandes (máx 10MB)")
    except HTTPException:
        raise
    except (TypeError, ValueError):
        pass


def _opaco(status: int, contexto: str) -> HTTPException:
    """Error 5xx opaco con error_id (el detalle queda solo en el log server-side)."""
    eid = uuid.uuid4().hex[:8]
    logger.exception("%s [error_id=%s]", contexto, eid)
    return HTTPException(status, f"Error interno (ref {eid})")


async def _read_limited_body(request: Request) -> bytes:
    """Acota también cuerpos sin Content-Length, antes de decodificar JSON/CSV."""
    chunks = bytearray()
    async for chunk in request.stream():
        if len(chunks) + len(chunk) > _MAX_CSV_BYTES:
            raise HTTPException(413, "predicciones demasiado grandes (máx 10MB)")
        chunks.extend(chunk)
    return bytes(chunks)


# (PredictionsUpload class removed — JSON body is now parsed directly via request.json())


# ---------------------------------------------------------------------------
# Listar datasets
# ---------------------------------------------------------------------------
@router.get("/datasets")
def list_datasets(tournament_id: str | None = None, round_number: int | None = None):
    from tournaments import get_supabase
    sb = get_supabase()
    q = sb.table("ml_datasets").select(
        "id,tournament_id,round_number,mode,kind,status,n_assets,n_eras,"
        "n_features,row_count,feature_cols,closes_at,bucket_path,version,"
        "round_type,score_version,published_at,target_available_at,finalized_at,"
        "data_hash,benchmarks,params"
    )
    if tournament_id:
        q = q.eq("tournament_id", tournament_id)
    if round_number:
        q = q.eq("round_number", round_number)
    data = q.in_("status", ["ready", "closed", "awaiting_labels", "scoring", "scored"]).order(
        "round_number", desc=True
    ).execute()
    # Las tres particiones tienen datos públicos; live no contiene target.
    out = []
    for d in data.data or []:
        visible = {key: d.get(key) for key in (
            "id", "tournament_id", "round_number", "mode", "kind", "status",
            "n_assets", "n_eras", "n_features", "row_count", "feature_cols",
            "closes_at", "version", "round_type", "score_version", "published_at",
            "target_available_at", "finalized_at", "data_hash",
        )}
        params = d.get("params") or {}
        for key in (
            "data_source", "data_license", "data_attribution",
            "data_attribution_url", "data_terms_url", "derived_data_license",
            "commercial_use_allowed",
        ):
            if key in params:
                visible[key] = params[key]
        visible["benchmarks"] = d.get("benchmarks") if d.get("status") == "scored" else None
        visible["download_url"] = (
            store.public_url(d["bucket_path"])
            if d.get("kind") in ("train", "validation", "live") and d.get("bucket_path")
            else None
        )
        out.append(visible)
    return {"datasets": out}


# ---------------------------------------------------------------------------
# Descargar un parquet público
# ---------------------------------------------------------------------------
@router.get("/datasets/{dataset_id}/download")
def download_dataset(dataset_id: str, kind: str = "train"):
    from tournaments import get_supabase
    sb = get_supabase()
    rec = sb.table("ml_datasets").select(
        "bucket_path,kind,status,params"
    ).eq("id", dataset_id).execute()
    if not rec.data:
        raise HTTPException(404, "dataset no encontrado")
    rec = rec.data[0]
    if rec["kind"] != kind or kind not in ("train", "validation", "live"):
        raise HTTPException(403, "tipo de dataset inválido")
    if rec["status"] in ("building", "failed"):
        raise HTTPException(404, "dataset aún no publicado")
    if not rec.get("bucket_path"):
        raise HTTPException(404, "ruta no disponible")
    params = rec.get("params") or {}
    license_metadata = {
        key: params[key] for key in (
            "data_source", "data_license", "data_attribution",
            "data_attribution_url", "data_terms_url", "derived_data_license",
            "commercial_use_allowed",
        ) if key in params
    }
    return {"url": store.public_url(rec["bucket_path"]), **license_metadata}


# ---------------------------------------------------------------------------
# Enviar predicciones (CSV o JSON)
# ---------------------------------------------------------------------------
def _validar_csv(df: pd.DataFrame) -> pd.DataFrame:
    """Valida columnas, rangos y NaN. Lanza HTTPException si algo falla."""
    # Normalizar nombres de columnas a minúsculas para evitar errores de casing
    df.columns = [col.strip().lower() for col in df.columns]
    
    if "id" not in df.columns or "prediction" not in df.columns:
        raise HTTPException(422, "el CSV debe tener columnas 'id' y 'prediction'")
    if df.empty or df["id"].isna().any() or df["id"].astype(str).str.strip().eq("").any():
        raise HTTPException(422, "id vacío o nulo")
    if df["id"].astype(str).duplicated().any():
        raise HTTPException(422, "id duplicado")
    if df["prediction"].isna().any():
        raise HTTPException(422, "prediction contiene valores nulos")
    if not pd.api.types.is_numeric_dtype(df["prediction"]):
        raise HTTPException(422, "prediction debe ser numérico")
    if not df["prediction"].map(math.isfinite).all():
        raise HTTPException(422, "prediction debe ser finito")
    return df[["id", "prediction"]].copy()


@router.post("/datasets/{dataset_id}/predictions")
async def submit_predictions(
    dataset_id: str,
    request: Request,
    file: UploadFile | None = None,
):
    try:
        import csv
        import io
        user_id = require_user(request)
        experiment = research.parse_experiment_header(request.headers.get("x-quantlab-experiment"))
        from tournaments import get_supabase
        sb = get_supabase()

        # Las rondas anteriores se muestran como archivo, pero no reciben
        # envíos bajo un protocolo que filtraba el score durante la apertura.
        ds = sb.table("ml_datasets").select(
            "id,kind,status,closes_at,bucket_path,data_hash,version,score_version"
        ).eq("id", dataset_id).execute()
        if not ds.data or ds.data[0]["kind"] != "live":
            raise HTTPException(404, "dataset de predicciones no encontrado")
        round_data = ds.data[0]
        if round_data.get("score_version") != protocol.SCORE_VERSION:
            raise HTTPException(409, "ronda anterior de solo lectura")
        if round_data["status"] != "ready":
            raise HTTPException(409, "la ronda no está abierta")
        closes_at = round_data.get("closes_at")
        if not closes_at or datetime.fromisoformat(closes_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
            raise HTTPException(409, "ronda cerrada")

        # 413 temprano: no leer ni parsear un body gigante.
        _rechazar_si_muy_grande(request)

        # CSV directo, multipart o JSON antiguo. La misma validación del
        # servidor se aplica a los tres; el navegador solo ofrece una vista.
        if file is not None:
            content = await file.read(_MAX_CSV_BYTES + 1)
        elif request.headers.get("content-type", "").startswith("text/csv"):
            content = await _read_limited_body(request)
        else:
            try:
                json_body = json.loads(await _read_limited_body(request))
                rows = json_body.get("rows")
                if not rows or not isinstance(rows, list):
                    raise HTTPException(422, "envía un archivo CSV o un body JSON con 'rows'")
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(["id", "prediction"])
                for r in rows:
                    w.writerow([r.get("id"), r.get("prediction")])
                content = buf.getvalue().encode("utf-8")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(422, "Datos de predicciones inválidos")
        if len(content) > _MAX_CSV_BYTES:
            raise HTTPException(413, "predicciones demasiado grandes (máx 10MB)")
        try:
            if not round_data.get("bucket_path") or not round_data.get("data_hash"):
                raise HTTPException(409, "dataset sin archivo verificable")
            live = store.download_parquet(round_data["bucket_path"])
            if not persist.verify_frame_hash(live, round_data["data_hash"]):
                raise _opaco(503, "Hash del live no coincide")
            if "target" in live.columns:
                raise _opaco(503, "Live publicó una etiqueta")
            checked = protocol.validate_predictions(content, live[["id", "era"]])
        except protocol.PredictionError as exc:
            raise HTTPException(422, str(exc)) from exc
        except HTTPException:
            raise
        except Exception:
            raise _opaco(503, "No se pudo verificar el dataset")

        # Ruta inmutable y privada, con recibo verificable. El RPC hace el
        # reemplazo atómico y vuelve a comprobar el cierre en la base de datos.
        sub_id = str(uuid.uuid4())
        suffix = ".experiment.csv" if experiment is not None else ".csv"
        path = f"{user_id}/{dataset_id}/{sub_id}{suffix}"
        digest = hashlib.sha256(content).hexdigest()
        payload = {
            "id": sub_id,
            "dataset_id": dataset_id,
            "user_id": user_id,
            "file_name": file.filename if file else "predictions.csv",
            "file_path": path,
            "file_sha256": digest,
            "dataset_version": round_data["version"],
            "row_count": len(checked),
            "status": "validated",
            "is_selected": False,
        }
        try:
            store.upload_csv(content, path)
            research.save_experiment(path, sub_id, round_data, digest, experiment)
            sb.table("prediction_submissions").insert(payload).execute()
            sb.rpc("activate_ml_submission", {"p_submission": sub_id}).execute()
        except HTTPException:
            raise
        except Exception:
            raise _opaco(502, "No se pudo almacenar o activar el envío")
        res = sb.table("prediction_submissions").select(
            "id,row_count,status,submitted_at,file_sha256,dataset_version,is_selected"
        ).eq("id", sub_id).eq("user_id", user_id).execute()
        return {"submission": res.data[0]}
    except HTTPException:
        raise
    except Exception:
        raise _opaco(500, "Error inesperado en submit_predictions")


# ---------------------------------------------------------------------------
# Evaluar submission bajo demanda (llamado desde el frontend vía polling)
# ---------------------------------------------------------------------------
@router.post("/submissions/{submission_id}/evaluate")
def evaluate_submission(submission_id: str, request: Request):
    require_user(request)
    raise HTTPException(410, "El scoring se ejecuta después del cierre de la ronda")


# ---------------------------------------------------------------------------
# Estado de una submission (para polling desde el frontend)
# ---------------------------------------------------------------------------
@router.get("/submissions/{submission_id}")
def get_submission(submission_id: str, request: Request):
    """Devuelve el estado y score de una submission propia (para polling)."""
    user_id = require_user(request)
    from tournaments import get_supabase
    sb = get_supabase()
    res = sb.table("prediction_submissions").select(
        "id,dataset_id,row_count,status,score,corr_mean,fnc_mean,consistencia,"
        "meta_corr,is_valid,plagio_flag,submitted_at,scored_at,file_sha256,"
        "dataset_version,is_selected,eval_error"
    ).eq("id", submission_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "submission no encontrada")
    return {"submission": res.data[0]}


# ---------------------------------------------------------------------------
# Mi envío
# ---------------------------------------------------------------------------
@router.get("/predictions/mine")
def my_prediction(dataset_id: str, request: Request):
    user_id = require_user(request)
    from tournaments import get_supabase
    sb = get_supabase()
    res = sb.table("prediction_submissions").select(
        "id,row_count,status,score,corr_mean,fnc_mean,consistencia,meta_corr,"
        "is_valid,plagio_flag,submitted_at,scored_at,file_sha256,dataset_version,"
        "is_selected,eval_error"
    ).eq("dataset_id", dataset_id).eq("user_id", user_id).eq(
        "is_selected", True
    ).order("submitted_at", desc=True).limit(1).execute()
    return {"submission": res.data[0] if res.data else None}


# ---------------------------------------------------------------------------
# Leaderboard de la ronda
# ---------------------------------------------------------------------------
@router.get("/leaderboard")
def leaderboard(dataset_id: str):
    from tournaments import get_supabase
    sb = get_supabase()
    ds = sb.table("ml_datasets").select("status").eq("id", dataset_id).execute()
    if not ds.data or ds.data[0]["status"] != "scored":
        return {"leaderboard": []}
    res = sb.table("prediction_submissions").select(
        "user_id,score,corr_mean,fnc_mean,consistencia,is_valid,plagio_flag,"
        "submitted_at"
    ).eq("dataset_id", dataset_id).eq("is_selected", True).eq(
        "is_valid", True
    ).order("score", desc=True).execute()
    return {"leaderboard": res.data or []}
