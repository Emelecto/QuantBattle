"use client";

import { useMemo } from "react";

interface EquityPoint {
  t: string;
  is?: number;
  oos?: number;
}

const EMPTY_POINTS: EquityPoint[] = [];

/**
 * Gráfico de equity curve con SVG inline (sin dependencias externas).
 * Muestra las curvas IS y OOS normalizadas a 100.
 */
export function EquityChart({
  data,
  curve,
  height = 220,
  showIS = true,
}: {
  data?: EquityPoint[];
  curve?: EquityPoint[];
  height?: number;
  showIS?: boolean;
}) {
  // Array estable cuando no llegan props: evita que el useMemo recalcule en cada render.
  const points = data ?? curve ?? EMPTY_POINTS;
  const { isPath, oosPath } = useMemo(() => {
    if (!points.length) return { isPath: "", oosPath: "" };

    const isPoints = points.map((d) => d.is ?? 100);
    const oosPoints = points.map((d) => d.oos ?? 100);
    const all = [...isPoints, ...oosPoints];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const pad = range * 0.08;

    const toPath = (vals: number[]) =>
      vals
        .map((v, i) => {
          const x = (i / (vals.length - 1 || 1)) * 100;
          const y = 100 - ((v - (min - pad)) / (range + pad * 2)) * 100;
          return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");

    return {
      isPath: toPath(isPoints),
      oosPath: toPath(oosPoints),
    };
  }, [points]);

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted"
        style={{ height }}
      >
        Sin datos de equity curve
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Curva de equity"
      >
        {/* Grid horizontal */}
        {[0, 25, 50, 75, 100].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="var(--qb-line)"
            strokeWidth="0.3"
            strokeDasharray="2,2"
          />
        ))}
        {/* Línea base 100 */}
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="var(--qb-muted)"
          strokeWidth="0.2"
          strokeDasharray="1,1"
        />
        {/* Curva IS (in-sample) */}
        {showIS && (
          <path
            d={isPath}
            fill="none"
            stroke="var(--qb-muted)"
            strokeWidth="0.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.5"
          />
        )}
        {/* Curva OOS (out-of-sample) */}
        <path
          d={oosPath}
          fill="none"
          stroke="var(--qb-accent)"
          strokeWidth="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
        {showIS && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-muted opacity-50" />
            IS (muestra)
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-accent" />
          OOS (fuera de muestra)
        </span>
      </div>
    </div>
  );
}

/**
 * Gráfico de drawdown con SVG inline.
 */
export function DrawdownChart({
  data,
  height = 120,
}: {
  data?: EquityPoint[];
  height?: number;
}) {
  const path = useMemo(() => {
    if (!data?.length) return "";
    const oos = data.map((d) => d.oos ?? 100);
    let peak = oos[0];
    const dd = oos.map((v) => {
      if (v > peak) peak = v;
      return ((v - peak) / peak) * 100;
    });
    const min = Math.min(...dd);
    return dd
      .map((v, i) => {
        const x = (i / (dd.length - 1 || 1)) * 100;
        const y = 100 - ((v - min) / (Math.abs(min) || 1)) * 100;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data]);

  if (!data?.length) return null;

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Drawdown"
      >
        <line
          x1="0"
          y1="0"
          x2="100"
          y2="0"
          stroke="var(--qb-line)"
          strokeWidth="0.3"
        />
        <path
          d={path}
          fill="var(--qb-short)"
          fillOpacity="0.15"
          stroke="var(--qb-short)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
