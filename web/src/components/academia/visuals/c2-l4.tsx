"use client";

/**
 * C2-L4 · Equity y underwater — curva real de 50 sesiones (c2_l4.csv)
 * + drawdown desde máximos y ficha Sharpe/Sortino/maxDD.
 */
import { useMemo } from "react";
import { AcademiaAreaChart, CountUp, Reveal } from "./charts";
import { C2_EQUITY } from "./lesson-data";

export default function C2L4Visual() {
  const ficha = useMemo(() => {
    const equity = C2_EQUITY.map(([f, , e]) => ({ tiempo: f, valor: e }));
    let pico = -Infinity;
    const underwater = C2_EQUITY.map(([f, , e]) => {
      pico = Math.max(pico, e);
      return { tiempo: f, valor: (e / pico - 1) * 100 };
    });
    const maxDD = Math.min(...underwater.map((d) => d.valor));
    const rets: number[] = [];
    for (let i = 1; i < C2_EQUITY.length; i++) rets.push(C2_EQUITY[i][2] / C2_EQUITY[i - 1][2] - 1);
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const s = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / (rets.length - 1));
    const sharpe = s > 0 ? (m / s) * Math.sqrt(252) : 0;
    const downside = rets.filter((x) => x < 0);
    const ds = Math.sqrt(downside.reduce((a, x) => a + x * x, 0) / rets.length);
    const sortino = ds > 0 ? (m / ds) * Math.sqrt(252) : 0;
    const total = (C2_EQUITY[C2_EQUITY.length - 1][2] / C2_EQUITY[0][2] - 1) * 100;
    return { equity, underwater, maxDD, sharpe, sortino, total };
  }, []);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Equity y su underwater</p>
        <p className="academia-viz-sub">
          {C2_EQUITY.length} sesiones reales con capital inicial 10 000. Arriba el equity; abajo el
          drawdown desde el último máximo: el dolor que hay que aguantar para cobrar el retorno.
        </p>
      </Reveal>
      <Reveal retraso={160}>
        <p className="academia-viz-graf-titulo">Equity (base 10 000)</p>
        <AcademiaAreaChart datos={ficha.equity} altura={240} color="#087951" etiqueta="Equity" formato={(v) => `$${v.toFixed(0)}`} />
      </Reveal>
      <Reveal retraso={240}>
        <p className="academia-viz-graf-titulo">Underwater — drawdown %</p>
        <AcademiaAreaChart datos={ficha.underwater} altura={150} color="#af3f4f" etiqueta="DD" formato={(v) => `${v.toFixed(2)} %`} />
      </Reveal>
      <Reveal retraso={320}>
        <div className="academia-stat-grid academia-stat-grid-4">
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno total</span>
            <span className={`academia-stat-valor ${ficha.total >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={ficha.total} decimales={1} prefijo={ficha.total >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sharpe (anual.)</span><span className="academia-stat-valor"><CountUp valor={ficha.sharpe} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sortino (anual.)</span><span className="academia-stat-valor"><CountUp valor={ficha.sortino} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Max drawdown</span><span className="academia-stat-valor academia-negativo"><CountUp valor={ficha.maxDD} decimales={1} sufijo=" %" /></span></div>
        </div>
      </Reveal>
    </div>
  );
}
