# Endpoints de referidos para el worker de QuantBattle.
# Sistema de invitación: código único + tracking + recompensa de 5 QP.

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["referrals"])

# Recompensa fija por referido
REFERRAL_QP_REWARD = 5


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


def _credit_qp(supabase_client, user_id: str, amount: int, type: str, ref_id: str | None = None, memo: str | None = None) -> None:
    """Acredita QP a un usuario. Versión local para evitar imports circulares."""
    # Insert ledger entry
    supabase_client.table("token_ledger").insert({
        "user_id": user_id,
        "amount": amount,
        "type": type,
        "ref_id": ref_id,
        "memo": memo,
    }).execute()
    # Update balance
    bal = supabase_client.table("tokens").select("balance").eq("user_id", user_id).execute()
    if bal.data:
        new_bal = int(bal.data[0]["balance"]) + amount
        supabase_client.table("tokens").update({"balance": new_bal}).eq("user_id", user_id).execute()
    else:
        supabase_client.table("tokens").insert({
            "user_id": user_id,
            "balance": amount,
            "lifetime_earned": amount,
            "lifetime_spent": 0,
            "tier": "free",
        }).execute()


def _generate_code(user_id: str) -> str:
    """Genera un código de referido único basado en el user_id."""
    # Usar los primeros 8 chars del user_id + 4 chars aleatorios
    base = user_id.replace("-", "")[:8]
    suffix = secrets.token_hex(2)
    return f"{base}{suffix}"


# ---------------------------------------------------------------------------
# Endpoints públicos (usuario autenticado)
# ---------------------------------------------------------------------------

@router.get("/referrals/code")
def get_my_referral_code(request: Request):
    """Devuelve el código de referido del usuario autenticado. Si no existe, lo crea."""
    uid = require_user(request)
    sb = _get_supabase()
    
    # Buscar código existente
    existing = sb.table("referral_codes").select("code").eq("user_id", uid).execute()
    if existing.data:
        return {"code": existing.data[0]["code"]}
    
    # Crear código nuevo
    code = _generate_code(uid)
    sb.table("referral_codes").insert({
        "user_id": uid,
        "code": code,
    }).execute()
    
    return {"code": code}


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
        raise HTTPException(403, "Acceso denegado")


@router.get("/referrals/validate")
def validate_referral_code(code: str, request: Request):
    """Valida si un código de referido existe. Requiere auth.

    Responde SOLO {"valid": bool}: jamás expone referrer_id ni el código,
    para evitar enumerar códigos y cosechar user_ids ajenos.
    """
    require_user(request)
    sb = _get_supabase()

    res = sb.table("referral_codes").select("code").eq("code", code).execute()
    return {"valid": bool(res.data)}


class TrackReferralBody(BaseModel):
    code: str


@router.post("/referrals/track")
def track_referral(body: TrackReferralBody, request: Request):
    """Registra un referido. El usuario autenticado fue invitado por el código."""
    uid = require_user(request)
    sb = _get_supabase()
    
    # Validar código
    code_res = sb.table("referral_codes").select("user_id,code").eq("code", body.code).execute()
    if not code_res.data:
        raise HTTPException(400, "Código de referido inválido")
    
    referrer_id = code_res.data[0]["user_id"]
    
    # No puede referirse a sí mismo
    if referrer_id == uid:
        raise HTTPException(400, "No puedes usar tu propio código de referido")
    
    # Verificar si ya fue referido
    existing = sb.table("referrals").select("id").eq("referred_id", uid).execute()
    if existing.data:
        raise HTTPException(400, "Ya has sido referido previamente")
    
    # Registrar referido
    ref = sb.table("referrals").insert({
        "referrer_id": referrer_id,
        "referred_id": uid,
        "status": "registered",
        "reward_qp": REFERRAL_QP_REWARD,
    }).execute()
    
    ref_id = ref.data[0]["id"] if ref.data else None
    
    # Dar QP al referidor
    try:
        _credit_qp(sb, referrer_id, REFERRAL_QP_REWARD, "referral_reward", ref_id, f"Referido: {uid[:8]}")
    except Exception as e:
        logger.warning(f"No se pudo acreditar QP al referidor {referrer_id}: {e}")
    
    # Dar QP al referido
    try:
        _credit_qp(sb, uid, REFERRAL_QP_REWARD, "referral_bonus", ref_id, f"Bonus por unirse vía referido")
    except Exception as e:
        logger.warning(f"No se pudo acreditar QP al referido {uid}: {e}")
    
    # Marcar como recompensado
    sb.table("referrals").update({
        "status": "rewarded",
        "rewarded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", ref_id).execute()

    # Verificar badges de referidos
    _check_referral_badges(referrer_id)

    # Notificar al referidor
    try:
        from notifications import notify_user
        notify_user(
            user_id=referrer_id,
            type="referral_joined",
            title="¡Alguien se unió con tu código!",
            body=f"Un usuario se registró con tu código de referido. Ganaste {REFERRAL_QP_REWARD} QP.",
            link="/app/profile",
        )
    except Exception:
        pass
    
    return {
        "ok": True,
        "reward_qp": REFERRAL_QP_REWARD,
        "referrer_id": referrer_id,
    }


@router.get("/referrals/stats")
def referral_stats(request: Request):
    """Estadísticas de referidos del usuario autenticado."""
    uid = require_user(request)
    sb = _get_supabase()
    
    # Contar referidos
    refs = sb.table("referrals").select("id,status").eq("referrer_id", uid).execute()
    total = len(refs.data or [])
    rewarded = len([r for r in (refs.data or []) if r.get("status") == "rewarded"])
    
    # QP ganado por referidos
    qp_earned = rewarded * REFERRAL_QP_REWARD
    
    return {
        "total_referidos": total,
        "rewarded": rewarded,
        "qp_earned": qp_earned,
        "reward_per_referral": REFERRAL_QP_REWARD,
    }
