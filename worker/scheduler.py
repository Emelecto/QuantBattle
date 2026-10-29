# Scheduler de torneos QuantBattle.
# Se ejecuta periódicamente (cron job) para crear, evaluar y cerrar torneos.

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import pandas as pd

import data_feed

logger = logging.getLogger(__name__)


def create_weekly_tournament(supabase_client, now: datetime | None = None) -> dict | None:
    """Crea el torneo semanal automático (BTCUSDT, 1d).

    Ventanas: IS = 90 días, OOS = 30 días desde el cierre de IS.
    Si ya existe un torneo weekly abierto/abierto-hoy, no crea duplicados.
    """
    now = now or datetime.now(timezone.utc)
    # Evitar duplicados: si hay un weekly con status open/draft creado en los últimos 3 días, no crear.
    recent = (
        supabase_client.table("tournaments")
        .select("id")
        .eq("type", "weekly")
        .in_("status", ["draft", "open"])
        .gte("created_at", (now - timedelta(days=3)).isoformat())
        .execute()
    )
    if recent.data:
        logger.info("Torneo weekly ya existe, se omite creación.")
        return None

    data_start = (now - timedelta(days=120)).date()
    data_end = (now - timedelta(days=30)).date()  # cierre IS
    eval_end = now.date()  # cierre OOS = hoy
    deadline = (now + timedelta(days=1)).isoformat()  # submissions hasta mañana

    payload = {
        "name": f"Torneo Semanal BTC · {now.strftime('%Y-W%V')}",
        "slug": f"weekly-btc-{now.strftime('%Y-W%V')}",
        "type": "weekly",
        "status": "open",
        "asset_type": "crypto",
        "symbols": ["BTCUSDT"],
        "timeframe": "1d",
        "data_start": str(data_start),
        "data_end": str(data_end),
        "eval_end": str(eval_end),
        "submission_deadline": deadline,
        "prize_pool_qp": 200,
        "primary_metric": "deflated_sharpe_oos",
        "min_trades": 10,
        "max_slippage_pct": 0.005,
        "rules_text": "Backtest OOS sobre BTCUSDT. Walk-forward 90d train / 30d test. Mínimo 10 operaciones.",
    }
    res = supabase_client.table("tournaments").insert(payload).execute()
    logger.info(f"Torneo weekly creado: {res.data[0]['id'] if res.data else 'error'}")
    return res.data[0] if res.data else None


def evaluate_tournaments(supabase_client, engine, now: datetime | None = None) -> int:
    """Evalúa torneos cerrados (deadline pasado) con submissions pendientes.

    Para cada submission pendiente:
      1. Corre el backtest en la ventana OOS.
      2. Guarda metrics, integrity_label, primary_score.
    Luego rankea y distribuye QP.
    """
    now = now or datetime.now(timezone.utc)
    # Nota: no usamos campo 'evaluated'; filtramos por submissions pendientes.
    tournaments = (
        supabase_client.table("tournaments")
        .select("id,primary_metric")
        .in_("status", ["closed", "evaluating"])
        .execute()
    )
    evaluated = 0
    for t in tournaments.data or []:
        pending = (
            supabase_client.table("submissions")
            .select("id,code,config,user_id,qp_staked")
            .eq("tournament_id", t["id"])
            .eq("status", "pending")
            .execute()
        )
        for sub in pending.data or []:
            try:
                from schemas import StrategyConfig
                cfg = StrategyConfig(**sub["config"])
                result = engine.run_backtest(cfg)
                metrics = result.get("metrics", {})
                integrity = result.get("integrity", "Low")
                primary = metrics.get(t.get("primary_metric", "deflated_sharpe_oos"), 0) or 0
                supabase_client.table("submissions").update({
                    "metrics": metrics,
                    "integrity_label": integrity,
                    "primary_score": primary,
                    "status": "scoring",
                }).eq("id", sub["id"]).execute()
            except Exception as e:
                supabase_client.table("submissions").update({
                    "status": "disqualified",
                    "eval_error": str(e)[:500],
                }).eq("id", sub["id"]).execute()
        # No marcar completed con submissions aún pendientes: si alguna quedó
        # en pending (fallo parcial del backtest), el torneo pasa a evaluating
        # y se reintenta en la próxima pasada del cron.
        restantes = (
            supabase_client.table("submissions")
            .select("id")
            .eq("tournament_id", t["id"])
            .eq("status", "pending")
            .execute()
        )
        if restantes.data:
            supabase_client.table("tournaments").update({"status": "evaluating"}).eq("id", t["id"]).execute()
            evaluated += 1
            continue
        evaluated += 1
        distribute_qp(supabase_client, t["id"])
        supabase_client.table("tournaments").update({"status": "completed"}).eq("id", t["id"]).execute()

    # Generación semanal de señales para estrategias del marketplace.
    try:
        generate_weekly_signals(supabase_client, now)
    except Exception as e:  # noqa: BLE001 - las señales no deben romper la evaluación
        logger.warning(f"generate_weekly_signals falló: {e}")
    return evaluated


def generate_weekly_signals(supabase_client, now: datetime | None = None) -> int:
    """Genera señales semanales (momentum 30d real) para cada estrategia publicada.

    Para cada marketplace_strategies con status='published':
      1. Descarga datos REALES del símbolo vía data_feed.get_ohlcv
         (crypto -> Binance klines, stock -> yfinance; el mismo mecanismo
         que usa el motor de backtests).
      2. Calcula momentum 30d: close_last vs close de hace ~30 días.
         direction = long/short; strength = min(|retorno| * 10, 0.99).
      3. Inserta UNA señal por estrategia, sin duplicar señal de hoy
         (misma strategy_id + symbol) y purgando señales > 7 días.

    Un fallo de fetch/insert en una estrategia no rompe al resto.
    Devuelve cuántas señales se insertaron.
    """
    now = now or datetime.now(timezone.utc)
    strategies = (
        supabase_client.table("marketplace_strategies")
        .select("id,symbol,asset_type,timeframe")
        .eq("status", "published")
        .execute()
    )

    # Purga previa: señales con más de 7 días fuera.
    try:
        supabase_client.table("signals").delete().lt(
            "created_at", (now - timedelta(days=7)).isoformat()
        ).execute()
    except Exception as e:  # noqa: BLE001 - la purga no bloquea la generación
        logger.warning(f"No se pudieron purgar señales antiguas: {e}")

    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    generated = 0

    for strat in strategies.data or []:
        try:
            sid = strat["id"]
            symbol = (strat.get("symbol") or "").strip().upper()
            if not symbol:
                continue
            asset_type = strat.get("asset_type") or (
                "crypto" if symbol.endswith("USDT") else "stock"
            )
            timeframe = strat.get("timeframe") or "1d"

            # Anti-duplicado ANTES de descargar datos: ya existe señal de hoy
            # para esta strategy+symbol -> no gastamos fetch ni insertamos.
            dup = (
                supabase_client.table("signals")
                .select("id")
                .eq("strategy_id", sid)
                .eq("symbol", symbol)
                .gte("created_at", day_start.isoformat())
                .execute()
            )
            if dup.data:
                continue

            df = data_feed.get_ohlcv(
                asset_type, symbol, timeframe,
                now - timedelta(days=45), now,
            )
            closes = df["close"].dropna()
            if getattr(closes.index, "tz", None) is None:
                closes.index = closes.index.tz_localize("UTC")
            cutoff = pd.Timestamp(now - timedelta(days=30))
            past = closes[closes.index <= cutoff]
            close_prev = float(past.iloc[-1]) if len(past) else float(closes.iloc[0])
            close_last = float(closes.iloc[-1])
            if close_prev == 0:
                raise ValueError(f"Precio previo inválido para '{symbol}'.")

            ret = (close_last - close_prev) / close_prev
            direction = "long" if ret >= 0 else "short"
            strength = round(min(abs(ret) * 10.0, 0.99), 2)

            supabase_client.table("signals").insert({
                "strategy_id": sid,
                "symbol": symbol,
                "direction": direction,
                "strength": strength,
                "metadata": {
                    "basis": "momentum_30d",
                    "close_last": close_last,
                    "close_prev": close_prev,
                },
            }).execute()
            generated += 1
        except Exception as e:  # noqa: BLE001 - un fallo no rompe el resto
            logger.warning(
                f"[signals] No se pudo generar señal para "
                f"{strat.get('symbol')}: {e}"
            )

    logger.info(f"[signals] Señales semanales generadas: {generated}")
    return generated


def distribute_qp(supabase_client, tournament_id: str):
    """Rankea submissions y distribuye QP según posición.

    Premio base: 1° = 200 QP, 2° = 100 QP, 3° = 50 QP. Resto con score>0 = 10 QP.
    Solo submissions con integrity_label = High y primary_score > 0.

    Decisión sobre el stake del perdedor: es COSTO DE ENTRADA, no se reembolsa.
    El stake ya quedó registrado en el ledger como `tournament_entry` (débito)
    al inscribirse (ver tournaments.py); solo se devuelve al reemplazar la
    submission (`tournament_refund`). Los premios se acreditan ENCIMA vía
    _credit_qp, sin devolver el stake ni a ganadores ni a perdedores.
    """
    subs = (
        supabase_client.table("submissions")
        .select("id,user_id,primary_score,integrity_label,qp_staked")
        .eq("tournament_id", tournament_id)
        .eq("status", "scoring")
        .eq("integrity_label", "High")
        .order("primary_score", desc=True)
        .execute()
    )
    prizes = {0: 200, 1: 100, 2: 50}
    entries = []
    for i, sub in enumerate(subs.data or []):
        if (sub.get("primary_score") or 0) <= 0:
            continue
        prize = prizes.get(i, 10)
        entries.append({
            "tournament_id": tournament_id,
            "user_id": sub["user_id"],
            "submission_id": sub["id"],
            "rank": i + 1,
            "score": sub["primary_score"],
            "qp_earned": prize,
        })
        # Actualizar submission con qp_earned
        supabase_client.table("submissions").update({
            "qp_earned": prize,
            "rank": i + 1,
            "status": "scored",
        }).eq("id", sub["id"]).execute()
        # Añadir QP al usuario
        _credit_qp(supabase_client, sub["user_id"], prize, "tournament_prize", tournament_id)
    if entries:
        supabase_client.table("leaderboard_entries").upsert(entries).execute()


def _credit_qp(supabase_client, user_id: str, amount: int, type: str, ref_id: str):
    """Añade QP al balance y registra en el ledger."""
    # Leer balance actual
    cur = supabase_client.table("tokens").select("balance,lifetime_earned").eq("user_id", user_id).execute()
    if cur.data:
        bal = cur.data[0]["balance"] + amount
        earned = cur.data[0]["lifetime_earned"] + max(0, amount)
        supabase_client.table("tokens").update({"balance": bal, "lifetime_earned": earned}).eq("user_id", user_id).execute()
    else:
        supabase_client.table("tokens").insert({
            "user_id": user_id, "balance": amount,
            "lifetime_earned": max(0, amount), "lifetime_spent": 0,
        }).execute()
    supabase_client.table("token_ledger").insert({
        "user_id": user_id, "amount": amount, "type": type,
        "ref_id": ref_id, "memo": f"Premio torneo" if type == "tournament_prize" else type,
    }).execute()
