# Endpoints de notificaciones para el worker de QuantBattle.
# CRUD de notificaciones en-app para usuarios autenticados.

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["notifications"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_supabase():
    """Cliente Supabase con service_role (server-side)."""
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas")
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Endpoints públicos (usuario autenticado)
# ---------------------------------------------------------------------------

@router.get("/notifications")
def list_notifications(request: Request, unread_only: bool = False, limit: int = 50):
    """Lista las notificaciones del usuario autenticado."""
    uid = require_user(request)
    sb = _get_supabase()
    
    q = (
        sb.table("notifications")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(min(limit, 100))
    )
    if unread_only:
        q = q.eq("is_read", False)
    
    res = q.execute()
    return {"notifications": res.data or []}


@router.get("/notifications/unread-count")
def unread_count(request: Request):
    """Cuenta las notificaciones no leídas del usuario."""
    uid = require_user(request)
    sb = _get_supabase()
    
    res = (
        sb.table("notifications")
        .select("id", count="exact")
        .eq("user_id", uid)
        .eq("is_read", False)
        .execute()
    )
    return {"count": res.count or 0}


class MarkReadBody(BaseModel):
    ids: list[str] | None = None  # si es null, marca todas como leídas


@router.post("/notifications/mark-read")
def mark_read(body: MarkReadBody, request: Request):
    """Marca notificaciones como leídas. Si ids es null, marca todas."""
    uid = require_user(request)
    sb = _get_supabase()
    
    if body.ids:
        sb.table("notifications").update({"is_read": True}).in_("id", body.ids).eq("user_id", uid).execute()
    else:
        sb.table("notifications").update({"is_read": True}).eq("user_id", uid).eq("is_read", False).execute()
    
    return {"ok": True}


# ---------------------------------------------------------------------------
# Endpoint interno: crear notificaciones (service_role only)
# ---------------------------------------------------------------------------

class CreateNotificationBody(BaseModel):
    user_id: str
    type: str
    title: str
    body: str
    link: str | None = None


def _require_service_role(request: Request) -> None:
    """Valida que la request venga con service_role (comparación timing-safe)."""
    import hmac
    import os

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Token requerido")

    token = auth_header[7:].strip()
    expected = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(403, "Solo service_role puede crear notificaciones")


@router.post("/internal/notifications/create")
def create_notification(body: CreateNotificationBody, request: Request):
    """Crea una notificación para un usuario. Solo service_role."""
    _require_service_role(request)
    sb = _get_supabase()
    
    row = {
        "user_id": body.user_id,
        "type": body.type,
        "title": body.title,
        "body": body.body,
        "link": body.link,
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    res = sb.table("notifications").insert(row).execute()
    if not res.data:
        raise HTTPException(500, "No se pudo crear la notificación")
    
    return {"id": res.data[0]["id"]}


# ---------------------------------------------------------------------------
# Helper para crear notificaciones desde otros módulos
# ---------------------------------------------------------------------------

def notify_user(
    user_id: str,
    type: str,
    title: str,
    body: str,
    link: str | None = None,
) -> None:
    """Crea una notificación para un usuario. Best-effort, no lanza excepciones."""
    try:
        sb = _get_supabase()
        sb.table("notifications").insert({
            "user_id": user_id,
            "type": type,
            "title": title,
            "body": body,
            "link": link,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"No se pudo crear notificación para {user_id}: {e}")
