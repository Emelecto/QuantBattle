"use client";

import { useMemo } from "react";
import { QuantChart, heroDemoPoints } from "@/components/charts/QuantChart";

/**
 * HeroChart — versión demo animada del QuantChart para el hero de la landing.
 * La línea se dibuja progresivamente (~2s) y muestra 3 chips de vidrio flotantes
 * con métricas destacadas. Crosshair interactivo.
 */
export function HeroChart() {
  // Reveal progresivo: recorta los datos al primer render y crece hasta el total.
  const all = useMemo(() => heroDemoPoints(), []);

  return (
    <div className="ql-perspective relative">
      <div className="ql-glass ql-elev-2 relative overflow-hidden rounded-xl border border-line p-3 sm:p-4">
        {/* Chips flotantes sobre la gráfica */}
        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-wrap items-start justify-center gap-2 px-4">
          <span className="ql-glass rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[11px] font-medium text-accent shadow-lg">
            Sharpe 1.42
          </span>
          <span className="ql-glass rounded-full border border-line bg-surface-solid/80 px-3 py-1 font-mono text-[11px] text-muted shadow-lg">
            MaxDD −18%
          </span>
          <span className="ql-glass rounded-full border border-long/30 bg-long/10 px-3 py-1 font-mono text-[11px] font-medium text-long shadow-lg">
            ▲ +237% OOS
          </span>
        </div>

        <HeroChartAnimated points={all} />
      </div>

      {/* Glow decorativo detrás */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(248,250,252,0.08), transparent)",
        }}
      />
    </div>
  );
}

function HeroChartAnimated({ points }: { points: Parameters<typeof QuantChart>[0]["points"] }) {
  // Anima revelando puntos progresivamente (determinista, sin estado global).
  const memo = useMemo(() => ({ points }), [points]);
  return (
    <QuantChartReveal points={memo.points} />
  );
}

function QuantChartReveal({ points }: { points: Parameters<typeof QuantChart>[0]["points"] }) {
  // Implementación simple: usa CSS para el efecto de reveal (el chart entero hace fade+clip),
  // mientras el chart ya es interactivo desde el frame 1.
  return (
    <div
      className="qlv3-chart-reveal"
      style={{ animationDuration: "1.8s" }}
    >
      <QuantChart points={points} height={300} showRanges={false} />
    </div>
  );
}