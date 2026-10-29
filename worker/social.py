# Sistema social de QuantBattle: follows entre usuarios y feed de actividad.
# Endpoints FastAPI: seguir/dejar de seguir (auth), feed personalizado (auth)
# y actividad global (público).

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["social"])

# Límite de eventos por página (coincide con el default del endpoint).
_DEFAULT_LIMIT = 30
_MAX_LIMIT = 100


def get_supabase():
    """Cliente Supabase service_role, mismo patrón que comments.py."""
    from tournaments import get_supabase as _get

    return _get()


def log_activity(
    actor_id: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
) -> None:
    """Registra un evento en activity_log, best-effort.

    Jamás lanza: si falla (Supabase caído, acción inválida...), solo se loguea.
    El flujo principal del llamador no debe romperse por telemetría social.
    """
    try:
        sb = get_supabase()
        sb.table("activity_log").insert(
            {
                "actor_id": actor_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "meta": meta or {},
            }
        ).execute()
    except Exception as e:  # noqa: BLE001 - telemetría, no debe romper nada
        logger.warning(f"log_activity falló ({action}): {e}")


def _format_event(row: dict) -> dict:
    """Fila de activity_log (con join a profiles) -> evento plano."""
    profile = row.get("profiles") or {}
    meta = row.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}
    return {
        "id": row.get("id"),
        "actor_id": row.get("actor_id"),
        "username": profile.get("username"),
        "action": row.get("action"),
        "target_type": row.get("target_type"),
        "target_id": row.get("target_id"),
        "meta": meta,
        "created_at": row.get("created_at"),
    }


@router.post("/social/{user_id}/follow")
def follow_user(user_id: str, request: Request):
    """Sigue a otro usuario (requiere auth). Rechaza auto-follow."""
    uid = require_user(request)
    if uid == user_id:
        raise HTTPException(400, "No puedes seguirte a ti mismo")
    sb = get_supabase()
    res = (
        sb.table("follows")
        .insert({"follower_id": uid, "followed_id": user_id})
        .execute()
    )
    if not res.data:
        raise HTTPException(500, "No se pudo seguir al usuario")
    return {"ok": True, "following": True}


@router.delete("/social/{user_id}/follow")
def unfollow_user(user_id: str, request: Request):
    """Deja de seguir a un usuario (requiere auth)."""
    uid = require_user(request)
    sb = get_supabase()
    res = (
        sb.table("follows")
        .delete()
        .eq("follower_id", uid)
        .eq("followed_id", user_id)
        .execute()
    )
    if not res.data:
        # No existe la relación (RLS + filtros por follower/followed).
        raise HTTPException(404, "No sigues a este usuario")
    return {"ok": True, "following": False}


@router.get("/social/feed")
def social_feed(request: Request, limit: int = _DEFAULT_LIMIT):
    """Feed de actividad de los usuarios que sigo + el mío propio (auth).

    Eventos de activity_log ordenados de más reciente a más antiguo,
    con username del actor vía join con profiles.
    """
    uid = require_user(request)
    limit = max(1, min(limit, _MAX_LIMIT))
    sb = get_supabase()

    # Ids que sigo + yo mismo.
    follows = (
        sb.table("follows").select("followed_id").eq("follower_id", uid).execute()
    )
    ids = [row.get("followed_id") for row in follows.data or []]
    ids.append(uid)

    res = (
        sb.table("activity_log")
        .select(
            "id,actor_id,action,target_type,target_id,meta,created_at,"
            "profiles(username)"
        )
        .in_("actor_id", ids)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [_format_event(row) for row in res.data or []]


@router.get("/social/activity")
def global_activity(limit: int = _DEFAULT_LIMIT):
    """Últimos eventos globales de actividad (lectura pública)."""
    limit = max(1, min(limit, _MAX_LIMIT))
    sb = get_supabase()
    res = (
        sb.table("activity_log")
        .select(
            "id,actor_id,action,target_type,target_id,meta,created_at,"
            "profiles(username)"
        )
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [_format_event(row) for row in res.data or []]
