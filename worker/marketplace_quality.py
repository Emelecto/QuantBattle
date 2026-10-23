"""Criterios de evidencia y archivo reversible; no infiere resultados de textos."""
import math


def review_reasons(row: dict) -> list[str]:
    reasons = []
    title = row.get("title") or ""
    if not isinstance(title, str) or len(title.strip()) < 3 or "\ufffd" in title or not any(c.isalnum() for c in title):
        reasons.append("Título vacío, dañado o sin contenido identificable")
    metrics = row.get("backtest_metrics")
    sharpe = metrics.get("sharpe_oos") if isinstance(metrics, dict) else None
    if type(sharpe) not in (int, float) or not math.isfinite(sharpe):
        reasons.append("No conserva un Sharpe OOS numérico en las métricas del backtest")
    if not isinstance(row.get("data_hash"), str) or not row["data_hash"].strip():
        reasons.append("No conserva la huella registrada por el motor")
    return reasons
