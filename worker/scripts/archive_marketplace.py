"""Revisión reversible del catálogo. Por defecto solo genera plan y respaldo local."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))
from dotenv import load_dotenv
load_dotenv(ROOT / "worker/.env")
from tournaments import get_supabase
from marketplace_quality import review_reasons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/marketplace-review")
    args = parser.parse_args()
    sb = get_supabase()
    rows = sb.table("marketplace_strategies").select("*").eq("status", "published").execute().data or []
    subscriptions = sb.table("strategy_subscriptions").select("strategy_id,status").in_("status", ["active", "paused"]).execute().data or []
    protected = {row["strategy_id"] for row in subscriptions}
    plan = [{"id": row["id"], "previous_status": row["status"], "reasons": review_reasons(row), "protected_by_subscription": row["id"] in protected}
            for row in rows if review_reasons(row)]
    args.output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # El respaldo completo se queda local: nunca se publica código de autores.
    backup = args.output / f"backup-{stamp}.json"
    backup.write_text(json.dumps({"rows": rows, "subscriptions": subscriptions}, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {"created_at": datetime.now(timezone.utc).isoformat(), "applied": args.apply, "plan": plan, "archived": []}
    report_path = args.output / f"review-{stamp}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.apply:
        for item in plan:
            if item["protected_by_subscription"]:
                continue
            changed = sb.table("marketplace_strategies").update({"status": "archived"}).eq("id", item["id"]).eq("status", "published").execute()
            report["archived"].extend(row["id"] for row in changed.data or [])
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"published_reviewed": len(rows), "candidates": len(plan), "protected": sum(item["protected_by_subscription"] for item in plan), "archived": len(report["archived"]), "report": str(report_path)}))


if __name__ == "__main__":
    main()
