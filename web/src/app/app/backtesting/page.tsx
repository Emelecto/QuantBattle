"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { AuthGuard } from "@/lib/AuthGuard";
import { getRuns, syncRunsFromSupabase } from "@/lib/runs";
import type { BacktestResult } from "@/lib/api";

function EmptyState() {
  return (
    <div className="ql-glass ql-elev-1 mt-10 flex flex-col items-center gap-4 rounded-xl px-6 py-14 text-center animate-fadeIn">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
        >
          <path d="M3 3v18h18" />
          <path d="M7 14l3-4 3 3 4-6" />
          <circle cx="17" cy="7" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <div>
        <h3 className="text-lg font-semibold text-ink">
          Sin estrategias todavía
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          Crea tu primera estrategia, pruébala con datos reales y descubre si
          sobrevive fuera de muestra.
        </p>
      </div>
      <Link
        href="/app/backtesting/new"
        className="ql-btn-primary ql-btn h-9 rounded-md px-5 text-sm font-medium"
      >
        Crear estrategia
      </Link>
    </div>
  );
}

function StrategyRow({ run }: { run: BacktestResult }) {
  const m = run.metrics;
  const sharpe = typeof m?.sharpe_oos === "number" ? m.sharpe_oos : null;
  const maxdd = typeof m?.maxdd === "number" ? m.maxdd : null;
  const high = run.integrity_label === "High";

  return (
    <Link
      href={`/app/strategies/${run.id}/results`}
      className="ql-glass ql-elev-1 ql-glass-hover flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4"
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">
          {run.config?.symbol ?? "—"}{" "}
          <span className="text-muted">· {run.config?.timeframe ?? "—"}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          {run.config?.asset_type === "crypto" ? "Cripto" : "Acción"} ·{" "}
          {new Date(run.created_at).toLocaleDateString("es-CO")}
        </p>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <p className="metric text-[10px] uppercase tracking-wider text-muted">
            Sharpe OOS
          </p>
          <p
            className={`metric text-sm font-semibold ${
              (sharpe ?? 0) >= 0 ? "text-long" : "text-short"
            }`}
          >
            {sharpe != null ? sharpe.toFixed(2) : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="metric text-[10px] uppercase tracking-wider text-muted">
            Max DD
          </p>
          <p className="metric text-sm font-semibold text-short">
            {maxdd != null ? `${(maxdd * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
        <span
          className={`metric rounded-md border px-2.5 py-1 text-[11px] font-medium ${
            high
              ? "border-long/40 bg-long/[0.08] text-long"
              : "border-short/40 bg-short/[0.08] text-short"
          }`}
        >
          {run.integrity_label ?? "—"}
        </span>
      </div>
    </Link>
  );
}

function StrategiesContent() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [syncError, setSyncError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setRuns(getRuns(user.id));
    setSyncError(false);
    setLoading(true);
    syncRunsFromSupabase(user.id)
      .then((saved) => { if (active) setRuns(saved); })
      .catch(() => { if (active) setSyncError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, retry]);

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              Mis estrategias
            </h1>
            <p className="mt-2 text-sm text-muted">
              Cada estrategia guarda su backtest fuera de muestra. Ábrela para
              publicarla o enviarla a un torneo.
            </p>
          </div>
          <Link
            href="/app/backtesting/new"
            className="ql-btn-primary ql-btn h-9 rounded-md px-5 text-sm font-medium"
          >
            Nueva estrategia
          </Link>
        </div>

        {syncError && <div role="alert" className="mt-6 text-sm text-short"><p>No se pudieron sincronizar tus estrategias. Se conservan las copias locales de esta cuenta.</p><button className="ql-btn-secondary mt-3" onClick={() => setRetry((value) => value + 1)}>Reintentar sincronización</button></div>}
        {loading ? (
          <div className="mt-10 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="ql-skeleton-card h-20 rounded-xl" />
            ))}
          </div>
        ) : syncError && runs.length === 0 ? null : runs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-10 space-y-3 animate-fadeIn">
            {runs.map((r) => (
              <StrategyRow key={r.id} run={r} />
            ))}
          </div>
        )}

        <p className="mt-10 text-[11px] text-muted">
          QuantLab es una herramienta de investigación. No es asesoría
          financiera ni recomendación de inversión.
        </p>
      </section>
    </main>
  );
}

export default function StrategiesPage() {
  return (
    <AuthGuard>
      <StrategiesContent />
    </AuthGuard>
  );
}
