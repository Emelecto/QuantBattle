"""Moderación UGC de QuantBattle.

Endpoints:
 POST /moderation/report                      → reportar comentario o estrategia (auth)
 GET  /moderation/reports?status=open         → listar reportes (solo admin)
 POST /moderation/{report_id}/resolve         → marcar resuelto (solo admin)
 POST /moderation/{report_id}/dismiss         → descartar reporte (solo admin)
 DELETE /comments/{comment_id}/admin          → borrar cualquier comentario (solo admin)

Rate limit de comentarios vive en comments.py.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_optional_user, require_user
from tournaments import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _is_admin(sb, uid: str) -> bool:
    """True si el usuario tiene is_admin en profiles."""
    res = sb.table("profiles").select("is_admin").eq("id", uid).execute()
    rows = getattr(res, "data", None) or []
    return bool(rows and rows[0].get("is_admin"))


def require_admin(request: Request):
    """Devuelve el uid del admin o lanza 403."""
    uid = require_user(request)
    sb = get_supabase()
    if not _is_admin(sb, uid):
        raise HTTPException(403, "Se requiere rol de administrador.")
    return uid


class ReportBody(BaseModel):
    target_type: Literal["comment", "marketplace_strategy"]
    target_id: str
    reason: str = Field(min_length=1, max_length=500)


# ---------------------------------------------------------------------------
# Reportar contenido (cualquier usuario autenticado)
# ---------------------------------------------------------------------------
@router.post("/moderation/report")
def create_report(body: ReportBody, request: Request):
    uid = require_user(request)
    sb = get_supabase()

    # Verifica que el objetivo exista según su tipo.
    table = (
        "marketplace_comments"
        if body.target_type == "comment"
        else "marketplace_strategies"
    )
    exists = (
        sb.table(table).select("id").eq("id", body.target_id).execute()
    )
    if not (getattr(exists, "data", None) or []):
        raise HTTPException(404, "El contenido reportado no existe.")

    res = (
        sb.table("content_reports")
        .insert({
            "reporter_id": uid,
            "target_type": body.target_type,
            "target_id": body.target_id,
            "reason": body.reason.strip(),
            "status": "open",
        })
        .execute()
    )
    row = (getattr(res, "data", None) or [{}])[0]
    return {"id": row.get("id"), "status": "open"}


# ---------------------------------------------------------------------------
# Gestión de reportes (solo admin)
# ---------------------------------------------------------------------------
@router.get("/moderation/reports")
def list_reports(request: Request, status: str = "open"):
    require_admin(request)
    if status not in ("open", "dismissed", "resolved"):
        raise HTTPException(400, "status inválido.")
    sb = get_supabase()
    res = (
        sb.table("content_reports")
        .select("*")
        .eq("status", status)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return getattr(res, "data", None) or []


def _set_report_status(report_id: str, new_status: str, request: Request):
    require_admin(request)
    sb = get_supabase()
    res = (
        sb.table("content_reports")
        .update({"status": new_status})
        .eq("id", report_id)
        .execute()
    )
    if not (getattr(res, "data", None) or []):
        raise HTTPException(404, "Reporte no encontrado.")
    return {"id": report_id, "status": new_status}


@router.post("/moderation/{report_id}/resolve")
def resolve_report(report_id: str, request: Request):
    return _set_report_status(report_id, "resolved", request)


@router.post("/moderation/{report_id}/dismiss")
def dismiss_report(report_id: str, request: Request):
    return _set_report_status(report_id, "dismissed", request)


@router.delete("/comments/{comment_id}/admin")
def admin_delete_comment(comment_id: str, request: Request):
    """Borra cualquier comentario (moderación). Registra quién lo hizo en logs."""
    admin_uid = require_admin(request)
    sb = get_supabase()
    res = (
        sb.table("marketplace_comments")
        .delete()
        .eq("id", comment_id)
        .execute()
    )
    if not (getattr(res, "data", None) or []):
        raise HTTPException(404, "Comentario no encontrado.")
    logger.info(
        "moderacion: comentario %s borrado por admin %s (%s)",
        comment_id,
        admin_uid,
        datetime.now(timezone.utc).isoformat(),
    )
    return {"ok": True}
