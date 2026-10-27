"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EquityChart } from "@/components/EquityChart";
import { BenchmarkComparator } from "@/components/studio/BenchmarkComparator";
import { buttonClasses } from "@/components/ui/Button";
import { getRun, syncRunsFromSupabase } from "@/lib/runs";
import { getPublicStrategy, supabaseRunToResult } from "@/lib/db";
import { publishStrategy } from "@/lib/tournaments";
import type { BacktestResult } from "@/lib/api";

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "long" | "short";
}) {
  return (
    <div className="ql-glass ql-elev-1 rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`metric mt-1 text-xl font-semibold ${
          tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

import { useAuth } from "@/lib/useAuth";

export default function ResultsPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<BacktestResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [priceQpWeek, setPriceQpWeek] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    const local = getRun(params.id, user?.id);
    if (local) {
      setRun(local);
      setLoaded(true);
      return;
    }
    let active = true;
    (async () => {
      if (user) {
        await syncRunsFromSupabase(user.id).catch(() => undefined);
        const own = getRun(params.id, user.id);
        if (own) { if (active) { setRun(own); setLoaded(true); } return null; }
      }
      return getPublicStrategy(params.id);
    })().then((res) => {
        if (!active) return;
        if (res && res.run) setRun(supabaseRunToResult(res.strategy, res.run));
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [params.id, user, authLoading]);

  if (loaded && !run) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted">Resultado no encontrado.</p>
        <Link href="/app" className={buttonClasses("secondary", "sm")}>
          Volver al dashboard
        </Link>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        Cargando…
      </main>
    );
  }

  const m = run.metrics;
  const integrityHigh = run.integrity_label === "High";

  async function handleAddToMarket() {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const c = run!.config;
      if (!c?.symbol || !c?.timeframe) {
        throw new Error(
          "Esta estrategia no tiene símbolo/timeframe guardados. Vuelve a correr el backtest.",
        );
      }
      const res = await publishStrategy({
        title: `${c.symbol} · ${c.timeframe}`,
        description: `Estrategia ${c.asset_type} en ${c.symbol} (${c.timeframe}). Sharpe OOS ${m.sharpe_oos?.toFixed(2) ?? "n/d"}.`,
        asset_type: c.asset_type,
        symbol: c.symbol,
        timeframe: c.timeframe,
        code: c.code || undefined,
        is_public_code: true,
        config: { ...c },
        price_qp_week: priceQpWeek,
      });
      if (res.status !== "published") {
        setPublishMsg("Guardada, pendiente de evidencia. No está disponible en el catálogo público.");
        return;
      }
      setPublishMsg(`Publicada con métricas guardadas (id ${res.id.slice(0, 8)}…). Redirigiendo…`);
      // Dar tiempo a que el usuario vea la confirmación antes de navegar.
      setTimeout(() => router.push("/app/marketplace/trading"), 1200);
    } catch (e) {
      setPublishMsg(`❌ ${e instanceof Error ? e.message : "No se pudo publicar."}`);
    } finally {
      setPublishing(false);
    }
  }

  function shareLink() {
    const url = `${window.location.origin}/app/strategies/${run!.id}/results`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadReport() {
    const txt = [
      `Estrategia: ${run!.config.symbol} (${run!.config.asset_type})`,
      `Rango: ${run!.config.start} → ${run!.config.end} · ${run!.config.timeframe}`,
      `Integridad: ${run!.integrity_label}`,
      "",
      run!.report ?? "",
      "",
      `Sharpe OOS: ${m.sharpe_oos?.toFixed(2) ?? "n/d"} · Deflated: ${m.deflated_sharpe_oos?.toFixed(2) ?? "n/d"}`,
      `Max DD: ${m.maxdd != null ? (m.maxdd * 100).toFixed(1) : "n/d"}% · Win rate: ${m.winrate != null ? (m.winrate * 100).toFixed(0) : "n/d"}%`,
      `Retorno total: ${m.ret_total != null ? (m.ret_total * 100).toFixed(1) : "n/d"}%`,
    ].join("\n");
    const blob = new Blob([txt], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quantlab-${run!.config.symbol}-reporte.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const oosCurve = (run.equity_curve ?? [])
    .filter((p) => p.oos != null)
    .map((p) => ({ t: p.t, oos: p.oos as number }));

  return (
      <main className="flex min-h-screen flex-col">
        <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {run.config.symbol}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {run.config.asset_type === "crypto" ? "Cripto" : "Acción"} ·{" "}
              {run.config.timeframe} · {run.config.start} → {run.config.end}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`metric rounded-md border px-3 py-1.5 text-sm font-medium ${
                integrityHigh
                  ? "border-long/40 bg-long/[0.08] text-long"
                  : "border-short/40 bg-short/[0.08] text-short"
              }`}
            >
              Integridad: {run.integrity_label}
            </span>
            <button onClick={shareLink} className={buttonClasses("secondary", "sm")}>
              {copied ? "¡Copiado!" : "Compartir"}
            </button>
            <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface/50 px-2 py-1">
              <span className="text-[11px] text-muted">Precio/sem</span>
              <input
                type="number"
                min={0}
                step={5}
                value={priceQpWeek}
                onChange={(e) => setPriceQpWeek(Math.max(0, Number(e.target.value) || 0))}
                className="w-14 bg-transparent text-right text-[13px] font-medium text-ink outline-none"
              />
              <span className="text-[11px] text-muted">QP</span>
            </div>
            <button onClick={handleAddToMarket} disabled={publishing} className={buttonClasses("secondary", "sm")}>
              {publishing ? "Publicando…" : "Agregar al mercado"}
            </button>
            <button onClick={downloadReport} className={buttonClasses("ghost", "sm")}>
              Descargar reporte
            </button>
          </div>
        </div>

        {publishMsg && (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-[13px] ${
              publishMsg.startsWith("✅")
                ? "border-long/30 bg-long/10 text-long"
                : "border-short/30 bg-short/10 text-short"
            }`}
          >
            {publishMsg}
          </p>
        )}

        {/* D14: reporte honesto destacado */}
        {run.report && (
          <div className="ql-glass ql-elev-2 mt-6 rounded-xl border border-accent/20 bg-accent/[0.04] p-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Lectura honesta</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                out-of-sample
              </span>
            </div>
            <p className="text-[14px] leading-relaxed text-ink/90">{run.report}</p>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Sharpe OOS" value={m.sharpe_oos?.toFixed(2) ?? "—"} tone={m.sharpe_oos >= 0 ? "long" : "short"} />
          <Metric label="Deflated Sharpe OOS" value={m.deflated_sharpe_oos?.toFixed(2) ?? "—"} tone={m.deflated_sharpe_oos >= 0 ? "long" : "short"} />
          <Metric label="Sortino" value={m.sortino?.toFixed(2) ?? "—"} />
          <Metric label="Max Drawdown" value={`${m.maxdd != null ? (m.maxdd * 100).toFixed(1) : "—"}%`} tone="short" />
          <Metric label="Win Rate" value={`${m.winrate != null ? (m.winrate * 100).toFixed(0) : "—"}%`} />
          <Metric label="Trades" value={m.n_trades != null ? String(m.n_trades) : "—"} />
          <Metric label="Retorno total" value={`${m.ret_total != null ? (m.ret_total * 100).toFixed(1) : "—"}%`} tone={m.ret_total >= 0 ? "long" : "short"} />
          <Metric label="Volatilidad" value={`${m.vol != null ? (m.vol * 100).toFixed(1) : "—"}%`} />
        </div>

        <div className="ql-glass ql-elev-2 mt-8 rounded-xl p-6">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-ink">Curva de equity</h2>
          <EquityChart curve={run.equity_curve} />
        </div>

        {/* D11: comparador vs benchmark (datos reales) */}
        <div className="mt-8">
          <BenchmarkComparator
            strategyEquity={oosCurve}
            asset_type={run.config.asset_type}
            symbol={run.config.symbol}
            timeframe={run.config.timeframe}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/app/backtesting/new" className={buttonClasses("primary", "lg")}>
            Nuevo backtest
          </Link>
          <Link
            href={`/app/backtesting/new?clone=${encodeURIComponent(run.config.code)}`}
            className={buttonClasses("secondary", "lg")}
          >
            Clonar esta estrategia
          </Link>
        </div>
      </section>
    </main>
  );
}
