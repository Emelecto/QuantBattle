"""Private operational evidence; contains no targets, symbols, tokens or raw errors."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os

from weekly_engine import all_rows, parse_time

JOB = "weekly_return_referee"


def validate_configuration(env=None):
    env = os.environ if env is None else env
    missing = [name for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATASET_SALT") if not env.get(name)]
    if missing:
        raise ValueError("Missing configuration names: " + ", ".join(missing))
    if len(env["DATASET_SALT"]) < 24:
        raise ValueError("DATASET_SALT must contain at least 24 characters")
    if env.get("ML_DAILY_TOURNAMENTS_ENABLED", "").lower() != "true":
        raise ValueError("Weekly real tournament automation is disabled")


def start_run(sb, run_id: str, sha: str | None, now: datetime):
    sb.table("operation_runs").insert({"job": JOB, "run_id": run_id,
        "commit_sha": sha, "started_at": now.isoformat(), "status": "running"}).execute()


def finish_run(sb, run_id: str, status: str, counts=None):
    sb.table("operation_runs").update({"status": status, "finished_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts or {}, "error_code": "REFEREE_FAILED" if status == "failed" else None}).eq("run_id", run_id).execute()


def assess_state(runs: list[dict], weeks: list[dict], rounds: list[dict], now: datetime, max_age_minutes=180):
    latest = max(runs, key=lambda row: parse_time(row["started_at"]), default=None)
    checks = []
    checks.append({"name": "recent_referee_success", "passed": bool(latest
        and latest["status"] == "success" and latest.get("finished_at")
        and timedelta(0) <= now - parse_time(latest["finished_at"]) <= timedelta(minutes=max_age_minutes))})
    late_rounds = [row["id"] for row in rounds if row["status"] in ("ready", "building", "pending")
        and now > parse_time(row["target_end"]) + timedelta(hours=2)]
    checks.append({"name": "no_overdue_rounds", "passed": not late_rounds, "round_ids": late_rounds})
    late_weeks = [row["id"] for row in weeks if row["status"] == "open"
        and now > parse_time(row["release_at"]) + timedelta(hours=2)]
    checks.append({"name": "no_overdue_publication", "passed": not late_weeks, "week_ids": late_weeks})
    return {"checked_at": now.isoformat(), "status": "ok" if all(c["passed"] for c in checks) else "attention",
        "checks": checks, "latest_run": ({name: latest.get(name) for name in
        ("run_id", "commit_sha", "started_at", "finished_at", "status", "counts", "error_code")} if latest else None),
        "open_weeks": len([w for w in weeks if w["status"] == "open"]),
        "limitation": "Operational health does not certify external adoption, profitability, or a completed real week."}


def readiness_report(sb, now=None):
    now = now or datetime.now(timezone.utc)
    runs = sb.table("operation_runs").select("*").eq("job", JOB).order("started_at", desc=True).limit(10).execute().data or []
    weeks = all_rows(sb, "ml_return_weeks", status="open")
    rounds = [row for week in weeks for row in all_rows(sb, "ml_return_rounds", week_id=week["id"])]
    return assess_state(runs, weeks, rounds, now)
