# Endpoints y lógica de badges de logros para el worker de QuantBattle.
# Sistema de gamificación: badges por primera submission, top 10, estrategia replicable, etc.

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["badges"])

# Definición de badges disponibles
BADGE_DEFINITIONS = {
    "first_submission": {
        "title": "Primera Submission",
        "description": "Enviaste tu primera estrategia a un torneo",
        "icon": "🎯",
    },
    "top_10_tournament": {
        "title": "Top 10",
        "description": "Quedaste en el top 10 de un torneo",
        "icon": "🏆",
    },
    "replicable_strategy": {
        "title": "Estrategia Replicable",
        "description": "Tu estrategia pasó el sello de replicabilidad",
        "icon": "✅",
    },
    "first_referral": {
        "title": "Primera Invitación",
        "description": "Invitaste a tu primer amigo",
        "icon": "👥",
    },
    "five_referrals": {
        "title": "5 Invitaciones",
        "description": "Invitaste a 5 amigos",
        "icon": "🌟",
    },
    "ten_referrals": {
        "title": "10 Invitaciones",
        "description": "Invitaste a 10 amigos",
        "icon": "💫",
    },
    "ml_master": {
        "title": "ML Master",
        "description": "Participaste en un torneo ML",
        "icon": "🤖",
    },
    "sharpe_1_5": {
        "title": "Sharpe 1.5+",
        "description": "Lograste un Sharpe OOS de 1.5 o más",
        "icon": "📈",
    },
    "tournament_winner": {
        "title": "Ganador de Torneo",
        "description": "Ganaste un torneo",
        "icon": "🥇",
    },
}


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


def award_badge(user_id: str, badge_type: str, metadata: dict | None = None) -> bool:
    """Intenta otorgar un badge a un usuario. Retorna True si fue otorgado, False si ya lo tenía."""
    if badge_type not in BADGE_DEFINITIONS:
        logger.warning(f"Badge desconocido: {badge_type}")
        return False
    
    sb = _get_supabase()
    try:
        # Verificar si ya tiene el badge
        existing = (
            sb.table("user_badges")
            .select("id")
            .eq("user_id", user_id)
            .eq("badge_type", badge_type)
            .execute()
        )
        if existing.data:
            return False  # Ya lo tiene
        
        # Otorgar badge
        sb.table("user_badges").insert({
            "user_id": user_id,
            "badge_type": badge_type,
            "metadata": metadata or {},
            "earned_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        
        # Notificar al usuario
        try:
            from notifications import notify_user
            badge = BADGE_DEFINITIONS[badge_type]
            notify_user(
                user_id=user_id,
                type="badge_earned",
                title=f"¡Badge desbloqueado: {badge['title']}!",
                description=badge["description"],
                link="/app/profile",
            )
        except Exception:
            pass
        
        logger.info(f"Badge {badge_type} otorgado a {user_id}")
        return True
    except Exception as e:
        logger.warning(f"No se pudo otorgar badge {badge_type} a {user_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Endpoints públicos (usuario autenticado)
# ---------------------------------------------------------------------------

@router.get("/badges")
def list_my_badges(request: Request):
    """Lista los badges del usuario autenticado."""
    uid = require_user(request)
    sb = _get_supabase()
    
    res = (
        sb.table("user_badges")
        .select("*")
        .eq("user_id", uid)
        .order("earned_at", desc=True)
        .execute()
    )
    
    badges = []
    for b in (res.data or []):
        badge_type = b.get("badge_type")
        definition = BADGE_DEFINITIONS.get(badge_type, {})
        badges.append({
            "id": b["id"],
            "type": badge_type,
            "title": definition.get("title", badge_type),
            "description": definition.get("description", ""),
            "icon": definition.get("icon", "🏅"),
            "earned_at": b["earned_at"],
            "metadata": b.get("metadata", {}),
        })
    
    return {"badges": badges}


@router.get("/badges/available")
def list_available_badges():
    """Lista todos los badges disponibles (público)."""
    return {"badges": BADGE_DEFINITIONS}
