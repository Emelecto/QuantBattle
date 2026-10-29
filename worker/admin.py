# Endpoints de admin para el worker de QuantBattle.
# Métricas, alertas y actividad para el dashboard de administración.
# Protegido: solo service_role o user_id específico.

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["admin"])


@router.get('/admin/launch-readiness')
def launch_readiness(request: Request):
    _require_admin(request)
    from operations import readiness_report
    try:
        return readiness_report(_get_supabase())
    except Exception as exc:
        raise _opaque_500(exc, 'launch_readiness') from exc

# IDs de admin. Configurable vía env ADMIN_USER_IDS (coma-separado);
# por defecto el UUID del admin actual (Emilio).
_DEFAULT_ADMIN_ID = "2ca7b197-86f5-4605-9789-266bf8a0df01"
ADMIN_USER_IDS = [
    s.strip()
    for s in os.environ.get("ADMIN_USER_IDS", _DEFAULT_ADMIN_ID).split(",")
    if s.strip()
]


def _get_admin_ids() -> list[str]:
    """Lee ADMIN_USER_IDS del entorno en cada llamada (permite rotar sin restart)."""
    raw = os.environ.get("ADMIN_USER_IDS", "").strip()
    if not raw:
        return ADMIN_USER_IDS
    return [s.strip() for s in raw.split(",") if s.strip()]


def _opaque_500(exc: Exception, contexto: str) -> HTTPException:
    """500 opaco: el detalle va al log; al cliente solo un error_id."""
    error_id = uuid.uuid4().hex[:12]
    logger.exception(f"Error en {contexto} [error_id={error_id}]: {exc}")
    return HTTPException(500, f"Error interno. error_id={error_id}")


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


def _require_admin(request: Request) -> str:
    """Verifica que el usuario sea admin."""
    uid = require_user(request)
    if uid not in _get_admin_ids():
        raise HTTPException(403, "No autorizado")
    return uid


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/admin/stats")
def admin_stats(request: Request):
    """Métricas principales para el dashboard de admin."""
    _require_admin(request)
    try:
        sb = _get_supabase()
        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        # Usuarios totales
        total_users = sb.table("profiles").select("id", count="exact").execute().count or 0

        # Usuarios activos última semana (WAU) y último mes (MAU).
        # NOTA: last_active_date vive en course_progress (migración 0015),
        # no en profiles; leer de profiles revienta con 500. Fallback a 0
        # para no tumbar el endpoint si course_progress falla.
        try:
            wau = (
                sb.table("course_progress")
                .select("user_id", count="exact")
                .gte("last_active_date", seven_days_ago.date().isoformat())
                .execute().count or 0
            )
            mau = (
                sb.table("course_progress")
                .select("user_id", count="exact")
                .gte("last_active_date", thirty_days_ago.date().isoformat())
                .execute().count or 0
            )
        except Exception:
            logger.warning("No se pudo calcular WAU/MAU desde course_progress; uso 0")
            wau, mau = 0, 0

        # Nuevos registros esta semana
        new_this_week = (
            sb.table("profiles")
            .select("id", count="exact")
            .gte("created_at", seven_days_ago.isoformat())
            .execute().count or 0
        )

        # Torneos totales
        total_tournaments = (
            sb.table("tournaments").select("id", count="exact").execute().count or 0
        )

        # Torneos abiertos
        open_tournaments = (
            sb.table("tournaments")
            .select("id", count="exact")
            .eq("status", "open")
            .execute().count or 0
        )

        # Submissions totales
        total_submissions = (
            sb.table("submissions").select("id", count="exact").execute().count or 0
        )

        # Submissions esta semana
        subs_this_week = (
            sb.table("submissions")
            .select("id", count="exact")
            .gte("submitted_at", seven_days_ago.isoformat())
            .execute().count or 0
        )

        # QP en circulación (suma de balances)
        qp_result = sb.table("tokens").select("balance").execute()
        qp_circulation = sum(r.get("balance", 0) for r in (qp_result.data or []))

        # QP emitidos (lifetime_earned)
        qp_earned_result = sb.table("tokens").select("lifetime_earned").execute()
        qp_emitted = sum(r.get("lifetime_earned", 0) for r in (qp_earned_result.data or []))

        # Total referidos
        total_referrals = (
            sb.table("referrals").select("id", count="exact").execute().count or 0
        )

        # Total badges otorgados
        total_badges = (
            sb.table("user_badges").select("id", count="exact").execute().count or 0
        )

        return {
            "users": {
                "total": total_users,
                "wau": wau,
                "mau": mau,
                "new_this_week": new_this_week,
            },
            "tournaments": {
                "total": total_tournaments,
                "open": open_tournaments,
            },
            "submissions": {
                "total": total_submissions,
                "this_week": subs_this_week,
            },
            "qp": {
                "circulation": qp_circulation,
                "emitted": qp_emitted,
            },
            "referrals": total_referrals,
            "badges": total_badges,
        }
    except Exception as e:
        logger.exception("Error en admin_stats")
        raise _opaque_500(e, "obtener métricas")


# ---------------------------------------------------------------------------
# Alertas
# ---------------------------------------------------------------------------

@router.get("/admin/alerts")
def admin_alerts(request: Request):
    """Alertas automáticas para el admin."""
    _require_admin(request)
    try:
        sb = _get_supabase()
        now = datetime.now(timezone.utc)
        alerts = []

        # Torneos abiertos sin submissions (24h antes del cierre)
        open_tournaments = (
            sb.table("tournaments")
            .select("id,name,submission_deadline")
            .eq("status", "open")
            .execute()
        )
        for t in (open_tournaments.data or []):
            deadline = t.get("submission_deadline")
            if deadline:
                deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                hours_until_close = (deadline_dt - now).total_seconds() / 3600
                if hours_until_close <= 24 and hours_until_close > 0:
                    # Contar submissions
                    subs = (
                        sb.table("submissions")
                        .select("id", count="exact")
                        .eq("tournament_id", t["id"])
                        .execute().count or 0
                    )
                    if subs == 0:
                        alerts.append({
                            "type": "empty_tournament",
                            "severity": "warning",
                            "title": f"Torneo sin submissions: {t['name']}",
                            "message": f"Cierra en {hours_until_close:.0f}h y no tiene envíos.",
                            "link": f"/app/tournaments/{t['id']}",
                        })

        # Submissions sin evaluar (más de 48h después del cierre)
        closed_tournaments = (
            sb.table("tournaments")
            .select("id,name,submission_deadline")
            .eq("status", "closed")
            .execute()
        )
        for t in (closed_tournaments.data or []):
            deadline = t.get("submission_deadline")
            if deadline:
                deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                hours_since_close = (now - deadline_dt).total_seconds() / 3600
                if hours_since_close > 48:
                    pending = (
                        sb.table("submissions")
                        .select("id", count="exact")
                        .eq("tournament_id", t["id"])
                        .eq("status", "pending")
                        .execute().count or 0
                    )
                    if pending > 0:
                        alerts.append({
                            "type": "unscored_submissions",
                            "severity": "error",
                            "title": f"Submissions sin evaluar: {t['name']}",
                            "message": f"{pending} envíos pendientes de evaluación.",
                            "link": f"/app/tournaments/{t['id']}",
                        })

        # Usuarios con QP negativo (inconsistencia)
        negative_qp = (
            sb.table("tokens")
            .select("user_id,balance")
            .lt("balance", 0)
            .execute()
        )
        if negative_qp.data:
            alerts.append({
                "type": "negative_qp",
                "severity": "error",
                "title": "Usuarios con QP negativo",
                "message": f"{len(negative_qp.data)} usuarios tienen balance negativo.",
                "link": None,
            })

        return {"alerts": alerts}
    except Exception as e:
        logger.exception("Error en admin_alerts")
        raise _opaque_500(e, "obtener alertas")


# ---------------------------------------------------------------------------
# Actividad reciente
# ---------------------------------------------------------------------------

@router.get("/admin/activity")
def admin_activity(request: Request, limit: int = 50):
    """Feed de actividad reciente (limit validado: 1..50)."""
    _require_admin(request)
    limit = max(1, min(limit, 50))
    try:
        sb = _get_supabase()

        # Últimos registros
        new_users = (
            sb.table("profiles")
            .select("id,username,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        # Últimas submissions
        recent_subs = (
            sb.table("submissions")
            .select("id,tournament_id,user_id,status,submitted_at")
            .order("submitted_at", desc=True)
            .limit(limit)
            .execute()
        )

        # Últimos badges
        recent_badges = (
            sb.table("user_badges")
            .select("user_id,badge_type,earned_at")
            .order("earned_at", desc=True)
            .limit(limit)
            .execute()
        )

        # Últimos referidos
        recent_refs = (
            sb.table("referrals")
            .select("referrer_id,referred_id,status,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        return {
            "new_users": new_users.data or [],
            "recent_submissions": recent_subs.data or [],
            "recent_badges": recent_badges.data or [],
            "recent_referrals": recent_refs.data or [],
        }
    except Exception as e:
        logger.exception("Error en admin_activity")
        raise _opaque_500(e, "obtener actividad")
