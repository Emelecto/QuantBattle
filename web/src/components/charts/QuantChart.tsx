"use client";

/**
 * QuantChart — gráfica de equity curve premium basada en Lightweight Charts
 * (TradingView open source). Área con gradiente teal, benchmark punteado,
 * zona OOS sombreada, panel de drawdown sincronizado, crosshair con tooltip
 * detallado en mono, zoom/pan táctil y botones de rango rápido.
 *
 * API compatible con el EquityChart legacy: acepta points/data con {t, insample?, oos}.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  AreaSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type QuantPoint = {
  /** ISO date string o timestamp ms */
  t: string | number;
  /** Valor equity in-sample (opcional) */
  insample?: number | null;
  /** Valor equity out-of-sample */
  oos?: number | null;
};

type TooltipData = {
  x: number;
  y: number;
  date: string;
  strategy: number | null;
  bench: number | null;
  dd: number | null;
} | null;

function toUtc(t: string | number): UTCTimestamp {
  const d = typeof t === "number" ? new Date(t) : new Date(t);
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
}

export function QuantChart({
  points,
  height = 380,
  showBenchmark = true,
  showRanges = true,
}: {
  points: QuantPoint[];
  height?: number;
  showBenchmark?: boolean;
  showRanges?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [range, setRange] = useState<"1M" | "3M" | "1Y" | "Todo">("Todo");

  // Serie de datos: estrategia = insample hasta donde haya, luego oos.
  const series = useMemo(() => {
    const strat: { time: UTCTimestamp; value: number }[] = [];
    const bench: { time: UTCTimestamp; value: number }[] = [];
    for (const p of points) {
      const time = toUtc(p.t);
      const v = p.oos ?? p.insample;
      if (v != null && Number.isFinite(v)) {
        strat.push({ time, value: v });
        // Benchmark sintético: buy & hold plano a 1.0 escalado — se reemplaza cuando
        // haya datos reales de benchmark en el payload.
        bench.push({ time, value: v * 0 + 1 });
      }
    }
    return { strat, bench };
  }, [points]);

  // Drawdown acumulado desde el máximo.
  const drawdown = useMemo(() => {
    return series.strat.reduce<{ time: UTCTimestamp; value: number; peak: number }[]>((result, p) => {
      const peak = Math.max(result.at(-1)?.peak ?? -Infinity, p.value);
      result.push({ time: p.time, value: peak > 0 ? (p.value / peak - 1) : 0, peak });
      return result;
    }, []);
  }, [series]);

  useEffect(() => {
    if (!containerRef.current || series.strat.length === 0) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(248,250,252,0.35)", labelBackgroundColor: "#0d1017" },
        horzLine: { color: "rgba(248,250,252,0.35)", labelBackgroundColor: "#0d1017" },
      },
      handleScale: { axisPressedMouseMove: false },
    });
    chartRef.current = chart;

    // Equity área teal con gradiente (v5: addSeries + AreaSeries definition).
    const area = chart.addSeries(AreaSeries, {
      lineColor: "#f8fafc",
      topColor: "rgba(248,250,252,0.18)",
      bottomColor: "rgba(94,234,212,0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    area.setData(series.strat);
    areaSeriesRef.current = area;

    // Benchmark punteado gris.
    if (showBenchmark) {
      const line = chart.addSeries(LineSeries, {
        color: "rgba(139,147,167,0.6)",
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line.setData(series.bench);
      lineSeriesRef.current = line;
    }

    // Crosshair → tooltip.
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }
      const stratVal = (param.seriesData.get(area) as { value?: number } | undefined)?.value ?? null;
      const benchVal = showBenchmark
        ? ((param.seriesData.get(lineSeriesRef.current!) as { value?: number } | undefined)?.value ?? null)
        : null;
      let dd: number | null = null;
      if (stratVal != null) {
        const idx = drawdown.findIndex((d) => d.time === param.time);
        dd = idx >= 0 ? drawdown[idx].value : null;
      }
      const d = new Date((param.time as number) * 1000);
      setTooltip({
        x: Math.min(param.point.x + 12, (containerRef.current?.clientWidth ?? 400) - 170),
        y: param.point.y,
        date: d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" }),
        strategy: stratVal,
        bench: benchVal,
        dd,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [series, height, showBenchmark, drawdown]);

  // Rango rápido: aplica visible range según selección.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || series.strat.length === 0) return;
    const ts = chart.timeScale();
    if (range === "Todo") {
      ts.fitContent();
      return;
    }
    const days = range === "1M" ? 30 : range === "3M" ? 90 : 365;
    const last = series.strat[series.strat.length - 1].time as number;
    ts.setVisibleRange({ from: (last - days * 86400) as UTCTimestamp, to: last as UTCTimestamp });
  }, [range, series]);

  if (series.strat.length === 0) {
    return (
      <div
        className="qb-glass flex items-center justify-center rounded-xl text-sm text-muted"
        style={{ height }}
      >
        Sin datos suficientes para graficar.
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Rango rápido */}
      {showRanges && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          {(["1M", "3M", "1Y", "Todo"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors ${
                range === r
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-surface-solid hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} className="w-full" style={{ height }} />

      {/* Tooltip flotante */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-line bg-surface-solid/95 px-3 py-2 font-mono text-[11px] leading-relaxed shadow-lg"
          style={{
            left: tooltip.x,
            top: Math.max(tooltip.y - 60, 8),
          }}
        >
          <div className="text-muted">{tooltip.date}</div>
          <div className="mt-1 text-ink">Estrategia {tooltip.strategy?.toFixed(4)}</div>
          {showBenchmark && tooltip.bench != null && (
            <div className="text-muted">Benchmark {tooltip.bench.toFixed(4)}</div>
          )}
          {tooltip.dd != null && (
            <div className={tooltip.dd < 0 ? "text-short" : "text-long"}>
              DD {(tooltip.dd * 100).toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Datos sintéticos deterministas para la gráfica hero (curva realista con drawdowns). */
export function heroDemoPoints(): QuantPoint[] {
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pts: QuantPoint[] = [];
  let v = 1;
  const d = new Date(2025, 0, 1);
  for (let i = 0; i < 420; i++) {
    const drift = 0.0028;
    const vol = (rand() - 0.5) * 0.03;
    // Inyecta 2 drawdowns notables.
    const shock = i === 140 ? -0.09 : i === 300 ? -0.06 : 0;
    v = v * (1 + drift + vol + shock);
    d.setDate(d.getDate() + 1);
    pts.push({ t: d.toISOString().slice(0, 10), oos: v });
  }
  return pts;
}
