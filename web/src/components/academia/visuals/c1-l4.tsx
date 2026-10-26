"use client";

/**
 * C1-L4 · Equity y underwater — curva SOL + drawdown con tooltip
 * + ficha animada (Sharpe / Sortino / max DD) calculada de los 90 puntos reales.
 */

import { useMemo } from "react";
import { AcademiaAreaChart, CountUp, Reveal, type TiempoValor } from "./charts";
import { SOL_EQUITY, SOL_FECHA_INICIAL, SOL_RETORNOS, sumarDias } from "./lesson-data";

function HeroEquity() {
  return (
    <svg className="academia-hero-svg" viewBox="0 0 320 120" role="img" aria-label="Equity con drawdown">
      <path
        d="M15 90 L60 70 L100 76 L150 40 L190 52 L230 30 L260 62 L290 48"
        fill="none" stroke="#087951" strokeWidth="2.5" strokeLinecap="round" className="academia-svg-trazo"
      />
      <path
        d="M230 30 L260 62 L290 48 L290 30 Z"
        fill="rgba(239,68,68,0.18)" stroke="#af3f4f" strokeWidth="1.5" strokeDasharray="4 3"
      />
      <text x="258" y="78" textAnchor="middle" className="academia-svg-mini">underwater</text>
    </svg>
  );
}

export function C1L4EquityUnderwater() {
  const ficha = useMemo(() => {
    const fechas = SOL_EQUITY.map((_, i) => sumarDias(SOL_FECHA_INICIAL, i));
    const equity: TiempoValor[] = SOL_EQUITY.map((v, i) => ({ tiempo: fechas[i], valor: v }));
    let pico = -Infinity;
    const underwater: TiempoValor[] = SOL_EQUITY.map((v, i) => {
      pico = Math.max(pico, v);
      return { tiempo: fechas[i], valor: (v / pico - 1) * 100 };
    });
    const maxDD = Math.min(...underwater.map((d) => d.valor));
    const r = SOL_RETORNOS.map((x) => x / 100);
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const s = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
    const sharpe = s > 0 ? (m / s) * Math.sqrt(252) : 0;
    const downside = r.filter((x) => x < 0);
    const ds = Math.sqrt(downside.reduce((a, x) => a + x * x, 0) / r.length);
    const sortino = ds > 0 ? (m / ds) * Math.sqrt(252) : 0;
    const total = (SOL_EQUITY[SOL_EQUITY.length - 1] / SOL_EQUITY[0] - 1) * 100;
    return { equity, underwater, maxDD, sharpe, sortino, total };
  }, []);

  return (
    <div className="academia-viz">
      <Reveal>
        <HeroEquity />
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-titulo">Equity de SOL y su underwater</p>
        <p className="academia-viz-sub">
          90 sesiones reales. Arriba el equity; abajo el drawdown desde el último máximo:
          el dolor que hay que aguantar para cobrar el retorno.
        </p>
      </Reveal>
      <Reveal retraso={200}>
        <p className="academia-viz-graf-titulo">Equity (base 100)</p>
        <AcademiaAreaChart
          datos={ficha.equity} altura={240} color="#087951" etiqueta="Equity"
          formato={(v) => v.toFixed(2)}
        />
      </Reveal>
      <Reveal retraso={260}>
        <p className="academia-viz-graf-titulo">Underwater — drawdown %</p>
        <AcademiaAreaChart
          datos={ficha.underwater} altura={150} color="#af3f4f" etiqueta="DD"
          formato={(v) => `${v.toFixed(2)} %`}
        />
      </Reveal>
      <Reveal retraso={320}>
        <div className="academia-stat-grid academia-stat-grid-4">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno total</span>
            <span className={`academia-stat-valor ${ficha.total >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={ficha.total} decimales={1} prefijo={ficha.total >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sharpe (anual.)</span>
            <span className="academia-stat-valor">
              <CountUp valor={ficha.sharpe} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Sortino (anual.)</span>
            <span className="academia-stat-valor">
              <CountUp valor={ficha.sortino} decimales={2} />
            </span>
          </div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Max drawdown</span>
            <span className="academia-stat-valor academia-negativo">
              <CountUp valor={ficha.maxDD} decimales={1} sufijo=" %" />
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
