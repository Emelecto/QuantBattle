"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EquityChart } from "@/components/EquityChart";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { getMarketplaceStrategy, type MarketplaceStrategy } from "@/lib/tokens";
import { getStrategySignals, subscribeToStrategy, type Signal } from "@/lib/tournaments";
import { getPublicStrategy, supabaseRunToResult } from "@/lib/db";
import type { BacktestResult } from "@/lib/api";
import { IntegritySeal } from "@/components/IntegritySeal";
import CommentsThread from "@/components/marketplace/CommentsThread";

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
      <div className="metric text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className={`metric mt-1 text-xl font-semibold ${
          tone === "long"
            ? "text-long"
            : tone === "short"
              ? "text-short"
              : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`text-sm ${i <= Math.round(rating) ? "text-accent" : "text-line"}`}
        >
          ★
        </span>
      ))}
      <span className="metric ml-1 text-xs text-muted">{rating.toFixed(1)}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Señales recientes                                                 */
/* ---------------------------------------------------------------- */

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-ES");
}

/** Normaliza strength a 0–100 (acepta fracciones 0–1 o porcentajes). */
function strengthPct(strength?: number): number | null {
  if (strength == null || !Number.isFinite(strength)) return null;
  const pct = Math.abs(strength) <= 1 ? strength * 100 : strength;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function SignalsEmptyState() {
  return (
    <div className="ql-glass ql-elev-1 flex flex-col items-center gap-3 rounded-xl px-6 py-12 text-center animate-fadeIn">
      <svg
        className="opacity-50"
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="30" stroke="rgba(94,234,212,0.25)" strokeWidth="1.5" fill="none" />
        <path d="M22 46 L34 36 L42 42 L58 30" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M52 30 H58 V36" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="40" cy="40" r="38" stroke="rgba(56,189,248,0.15)" strokeWidth="1" strokeDasharray="4 4" fill="none" />
      </svg>
      <p className="max-w-md text-sm text-muted">
        Aún no hay señales generadas para esta estrategia. Se generan
        automáticamente cada semana.
      </p>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const isLong = signal.direction === "long";
  const isClose = signal.direction === "close";
  const dirColor = isClose ? "text-muted" : isLong ? "text-long" : "text-short";
  const barColor = isClose ? "bg-muted" : isLong ? "bg-long" : "bg-short";
  const dirIcon = isClose ? "●" : isLong ? "▲" : "▼";
  const dirLabel = isClose ? "Cerrar" : isLong ? "Long" : "Short";
  const pct = strengthPct(signal.strength);

  return (
    <li className="ql-row flex items-center gap-3 px-5 py-3">
      {/* Dirección */}
      <span
        className={`metric flex w-[70px] shrink-0 items-center justify-center gap-1 rounded-md border border-line px-1.5 py-1 text-[11px] font-semibold ${dirColor}`}
      >
        <span aria-hidden="true">{dirIcon}</span>
        {dirLabel}
      </span>

      {/* Símbolo */}
      <div className="min-w-0 flex-1">
        <p className="metric truncate text-[13px] font-medium text-ink">
          {signal.symbol}
        </p>
      </div>

      {/* Fuerza (barra + %) */}
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
          {pct != null && (
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span className="metric w-9 text-right text-[11px] text-muted">
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>

      {/* Fecha relativa */}
      <span className="metric w-20 shrink-0 text-right text-[11px] text-muted">
        {relativeDate(signal.created_at)}
      </span>
    </li>
  );
}

export default function StrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const [strategy, setStrategy] = useState<MarketplaceStrategy | null>(null);
  const [run, setRun] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  // null = cargando; [] = sin señales (o error/404 → empty state)
  const [signals, setSignals] = useState<Signal[] | null>(null);
  // Pestañas de la zona inferior: "senales" | "integridad"
  const [tab, setTab] = useState<"senales" | "integridad">("senales");
  // Sección de código colapsable (solo si is_public_code === true)
  const [codeOpen, setCodeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getStrategySignals(params.id, 20)
      .then((list) => {
        if (active) setSignals(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        // 404 u otro error del worker → mostramos el empty state, sin crash
        if (active) setSignals([]);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  useEffect(() => {
    let active = true;
    getMarketplaceStrategy(params.id)
      .then((res) => {
        if (!active) return;
        setStrategy(res);
        if (res) {
          return getPublicStrategy(res.id);
        }
        return null;
      })
      .then((publicData) => {
        if (!active || !publicData) return;
        if (publicData.run) {
          setRun(supabaseRunToResult(publicData.strategy, publicData.run));
        }
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [params.id]);

  async function handleSubscribe() {
    if (!strategy) return;
    setSubscribing(true);
    setSubMsg(null);
    try {
      await subscribeToStrategy(strategy.id);
      const precio = strategy.price_qp ?? 0;
      setSubMsg(`✅ Suscrito · −${precio} QP`);
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : "No se pudo suscribir.";
      // 402 = saldo QP insuficiente (lo devuelve el worker al cobrar).
      if (errMsg.includes("402") || errMsg.toLowerCase().includes("insuficiente")) {
        setSubMsg("QP insuficientes");
      } else {
        setSubMsg(errMsg);
      }
    } finally {
      setSubscribing(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        Cargando…
      </main>
    );
  }

  if (!strategy) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted">Estrategia no encontrada.</p>
        <Link href="/app/marketplace/trading" className={buttonClasses("secondary", "sm")}>
          Volver al marketplace
        </Link>
      </main>
    );
  }

  const m = run?.metrics;

  // Campos de integridad (Fase 2) con fallback a backtest_metrics / defaults.
  const benchBH =
    typeof strategy.bench_buyhold === "number"
      ? strategy.bench_buyhold
      : typeof strategy.backtest_metrics?.bench_buyhold === "number"
      ? strategy.backtest_metrics.bench_buyhold
      : undefined;
  const benchMA =
    typeof strategy.bench_ma === "number"
      ? strategy.bench_ma
      : typeof strategy.backtest_metrics?.bench_ma === "number"
      ? strategy.backtest_metrics.bench_ma
      : undefined;
  const methodText =
    strategy.method ||
    (typeof strategy.backtest_metrics?.method === "string"
      ? strategy.backtest_metrics.method
      : "walk-forward OOS");
  const prof = strategy.profiles ?? undefined;

  return (
    <main className="flex min-h-screen flex-col">
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="metric flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-solid text-[14px] text-muted">
                {(strategy.author ?? "??").slice(0, 2).toUpperCase()}
              </span>
              <div>
                <Link
                  href={`/app/profile/${strategy.author_id}`}
                  className="metric text-sm text-muted hover:text-accent transition-colors"
                >
                  @{strategy.author ?? "anónimo"}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge tone="cyan" mono>
                    {strategy.asset_type === "crypto" ? "Cripto" : "Acción"}
                  </Badge>
                  <Badge tone="neutral" mono>
                    {strategy.symbol}
                  </Badge>
                </div>
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {strategy.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted max-w-2xl">
              {strategy.description}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <StarRating rating={strategy.rating ?? 0} />
              <span className="metric text-xs text-muted">
                {strategy.subscribers ?? 0} suscriptores
              </span>
            </div>
          </div>

          {/* Card de suscripción */}
          <div className="ql-glass ql-tier-featured ql-elev-2 w-72 shrink-0 rounded-xl p-5">
            <p className="metric text-[10px] uppercase tracking-wider text-muted">
              Precio semanal
            </p>
            <p className="metric text-accent ql-glow-text text-2xl font-bold mt-1">
              {strategy.price_qp} QP
              <span className="text-xs font-normal text-muted">/sem</span>
            </p>
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={subscribing || (strategy.status !== "published" || strategy.catalog_available === false)}
              className={buttonClasses("primary", "lg", "w-full mt-4")}
            >
              {(strategy.status !== "published" || strategy.catalog_available === false) ? "Fuera del catálogo público" : subscribing ? "Procesando…" : `Suscribirse (${strategy.price_qp} QP/sem)`}
            </button>
            {subMsg && (
              <p
                className={`metric text-[11px] mt-2 text-center ${
                  subMsg.startsWith("✅") ? "text-long" : "text-short"
                }`}
              >
                {subMsg}
              </p>
            )}
            <p className="metric text-[10px] text-muted mt-2 text-center">
              Cancela cuando quieras
            </p>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric
            label="Sharpe OOS"
            value={m ? m.sharpe_oos.toFixed(2) : (strategy.sharpe?.toFixed(2) ?? "—")}
            tone={m ? (m.sharpe_oos >= 0 ? "long" : "short") : undefined}
          />
          <Metric
            label="Max Drawdown"
            value={m ? `${(m.maxdd * 100).toFixed(1)}%` : (strategy.max_dd != null ? `${strategy.max_dd.toFixed(1)}%` : "—")}
            tone="short"
          />
          <Metric
            label="Win Rate"
            value={m ? `${(m.winrate * 100).toFixed(0)}%` : "—"}
          />
          <Metric
            label="Trades"
            value={m ? String(m.n_trades) : "—"}
          />
          <Metric
            label="Retorno total"
            value={m ? `${(m.ret_total * 100).toFixed(1)}%` : "—"}
            tone={m ? (m.ret_total >= 0 ? "long" : "short") : undefined}
          />
        </div>

        {/* Código fuente (solo si el autor lo hizo público) — colapsable */}
        <div className="ql-glass ql-elev-1 mt-8 rounded-xl p-6">
          {strategy.is_public_code ? (
            <>
              <button
                type="button"
                onClick={() => setCodeOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={codeOpen}
              >
                <h2 className="text-sm font-semibold tracking-tight text-ink">
                  Código fuente
                </h2>
                <span className="metric text-[11px] text-muted">
                  {codeOpen ? "Ocultar ▲" : "Ver código ▼"}
                </span>
              </button>
              {codeOpen &&
                (strategy.code ? (
                  <pre className="mt-4 overflow-x-auto rounded-lg bg-bg/60 border border-line p-4 text-[12px] font-mono text-muted leading-relaxed max-h-[400px] overflow-y-auto">
                    <code>{strategy.code}</code>
                  </pre>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    El autor marcó el código como público, pero aún no lo ha
                    subido.
                  </p>
                ))}
            </>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold tracking-tight text-ink">
                Cómo funciona
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                {strategy.description}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric
                  label="Sharpe OOS"
                  value={
                    typeof strategy.backtest_metrics?.sharpe_oos === "number"
                      ? strategy.backtest_metrics.sharpe_oos.toFixed(2)
                      : strategy.sharpe?.toFixed(2) ?? "—"
                  }
                />
                <Metric
                  label="MaxDD"
                  value={
                    typeof strategy.backtest_metrics?.maxdd === "number"
                      ? `${(strategy.backtest_metrics.maxdd * 100).toFixed(1)}%`
                      : strategy.max_dd != null
                      ? `${strategy.max_dd.toFixed(1)}%`
                      : "—"
                  }
                />
                <Metric label="Método" value={methodText} />
              </div>
            </>
          )}
        </div>

        {/* Perfil del autor embebido */}
        <div className="ql-glass ql-elev-1 mt-8 rounded-xl p-6">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-ink">
            Autor
          </h2>
          <div className="flex items-center gap-3">
            <span className="metric flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-solid text-[14px] text-muted">
              {(prof?.display_name ?? strategy.author ?? "??").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <Link
                href={`/app/profile/${strategy.author_id}`}
                className="text-sm font-medium text-ink transition-colors hover:text-accent"
              >
                @{prof?.username ?? strategy.author ?? "anónimo"}
                {prof?.display_name ? ` · ${prof.display_name}` : ""}
              </Link>
              <p className="metric mt-0.5 text-[11px] text-muted">
                Racha de integridad:{" "}
                {typeof strategy.author_integrity_streak === "number"
                  ? `${strategy.author_integrity_streak} sem`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas: Señales / Integridad */}
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-1 border-b border-line">
            <button
              type="button"
              onClick={() => setTab("senales")}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === "senales"
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Señales
            </button>
            <button
              type="button"
              onClick={() => setTab("integridad")}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === "integridad"
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Integridad
            </button>
          </div>

          {tab === "senales" ? (
            <div className="animate-fadeIn">
              <p className="mb-3 text-[12px] text-muted">
                Muestra gratis: 3 señales recientes. Suscríbete para recibirlas
                en vivo.
              </p>
              {signals === null ? (
                <div className="ql-glass ql-elev-1 space-y-3 rounded-xl p-5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="ql-skeleton-line h-8 w-full" />
                  ))}
                </div>
              ) : signals.length === 0 ? (
                <SignalsEmptyState />
              ) : (
                <div className="ql-glass ql-elev-1 overflow-hidden rounded-xl">
                  <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                    {signals.slice(0, 3).map((s) => (
                      <SignalRow key={s.id} signal={s} />
                    ))}
                  </ul>
                  {signals.length > 3 && (
                    <div className="border-t border-line px-5 py-3 text-center">
                      <button
                        type="button"
                        onClick={handleSubscribe}
                        disabled={subscribing || (strategy.status !== "published" || strategy.catalog_available === false)}
                        className={buttonClasses("primary", "sm")}
                      >
                        {subscribing
                          ? "Procesando…"
                          : `Ver ${signals.length - 3} señales más (${strategy.price_qp} QP/sem)`}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted">
                Las señales son informativas. No es asesoría financiera.
              </p>
            </div>
          ) : (
            <div className="animate-fadeIn space-y-4">
              {/* Gráfico equity IS / OOS */}
              <div className="ql-glass ql-elev-2 rounded-xl p-6">
                <h3 className="mb-4 text-sm font-semibold tracking-tight text-ink">
                  Curva de equity — IS / OOS
                </h3>
                <EquityChart data={strategy.backtest_equity ?? []} height={260} />
              </div>

              {/* Método + benchmarks */}
              <div className="ql-glass ql-elev-1 rounded-xl p-6">
                <h3 className="mb-4 text-sm font-semibold tracking-tight text-ink">
                  Metodología y benchmarks
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Metric label="Método" value={methodText} />
                  <Metric
                    label="vs Buy & Hold"
                    value={
                      benchBH == null
                        ? "—"
                        : `${benchBH >= 0 ? "+" : "−"}${Math.abs(benchBH).toFixed(1)}%`
                    }
                    tone={benchBH == null ? undefined : benchBH >= 0 ? "long" : "short"}
                  />
                  <Metric
                    label="vs Media Móvil"
                    value={
                      benchMA == null
                        ? "—"
                        : `${benchMA >= 0 ? "+" : "−"}${Math.abs(benchMA).toFixed(1)}%`
                    }
                    tone={benchMA == null ? undefined : benchMA >= 0 ? "long" : "short"}
                  />
                </div>
              </div>

              {/* Sello ampliado */}
              <div className="ql-glass ql-elev-1 rounded-xl p-6">
                <h3 className="mb-4 text-sm font-semibold tracking-tight text-ink">
                  Sello de Integridad
                </h3>
                <IntegritySeal
                  backtest_metrics={strategy.backtest_metrics}
                  replicable={strategy.replicable}
                  method={strategy.method}
                  size="lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* Comentarios */}
        <div className="mt-8">
          <CommentsThread strategyId={strategy.id} />
        </div>
      </section>
    </main>
  );
}
