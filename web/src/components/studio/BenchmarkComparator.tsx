"use client";

import { useEffect, useState } from "react";

/**
 * Compara la estrategia del usuario contra "hacer nada" (buy & hold del mismo
 * activo). Dibuja ambas curvas normalizadas a 100 en SVG. El benchmark se
 * calcula con datos REALES (Binance/yfinance) sin API key, vía marketData.ts.
 *
 * Se coloca en la pantalla de RESULTADOS (no en el editor).
 */
export function BenchmarkComparator({
  strategyEquity,
  asset_type,
  symbol,
  timeframe,
}: {
  strategyEquity: Array<{ t: string; oos: number }>;
  asset_type: "crypto" | "stock" | "etf";
  symbol: string;
  timeframe: string;
}) {
  const [bench, setBench] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!strategyEquity.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { fetchPrices } = await import("./marketData");
        const prices = await fetchPrices(asset_type, symbol, timeframe);
        if (cancelled) return;
        if (!prices.length) {
          setError("No hay datos de benchmark.");
          return;
        }
        const base = prices[0];
        setBench(prices.map((p) => (p / base) * 100));
      } catch {
        if (!cancelled) setError("No se pudo cargar el benchmark.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strategyEquity, asset_type, symbol, timeframe]);

  if (!strategyEquity.length) {
    return (
      <div className="qb-glass qb-elev-1 flex h-[240px] items-center justify-center rounded-xl p-4 text-center text-[13px] text-muted">
        Corre un backtest para comparar tu estrategia contra el benchmark.
      </div>
    );
  }

  if (error) {
    return (
      <div className="qb-glass qb-elev-1 flex h-[240px] items-center justify-center rounded-xl p-4 text-center text-[13px] text-short">
        {error}
      </div>
    );
  }

  const strat = strategyEquity.map((p) => p.oos * 100);
  const n = Math.min(strat.length, bench?.length ?? 0);
  const sSlice = strat.slice(0, n);
  const bSlice = (bench ?? []).slice(0, n);

  const sEnd = sSlice[sSlice.length - 1] ?? 100;
  const bEnd = bSlice[bSlice.length - 1] ?? 100;
  const beat = sEnd > bEnd;

  const W = 600;
  const H = 200;
  const toPath = (arr: number[]) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const span = max - min || 1;
    return arr
      .map((v, i) => {
        const x = (i / (arr.length - 1 || 1)) * W;
        const y = H - ((v - min) / span) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <div className="qb-glass qb-elev-1 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Tu estrategia vs. hacer nada
        </h3>
        <span
          className={
            "rounded-md px-2.5 py-1 text-[12px] font-medium " +
            (beat
              ? "border border-long/40 bg-long/10 text-long"
              : "border border-short/40 bg-short/10 text-short")
          }
        >
          {beat ? "Superó al benchmark" : "No lo superó"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[200px] w-full" preserveAspectRatio="none">
        <path d={toPath(bSlice)} fill="none" stroke="var(--qb-muted)" strokeWidth={1.5} opacity={0.6} />
        <path d={toPath(sSlice)} fill="none" stroke="var(--qb-accent)" strokeWidth={2} />
      </svg>

      <div className="mt-2 flex items-center gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> Tu estrategia ({sEnd.toFixed(0)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-muted" /> {symbol} buy &amp; hold ({bEnd.toFixed(0)})
        </span>
      </div>
    </div>
  );
}
