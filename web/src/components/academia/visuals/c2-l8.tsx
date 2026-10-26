"use client";

/**
 * C2-L8 · Grid de hiperparámetros — 12 celdas fast×slow (c2_l8_grid.csv)
 * coloreadas por Sharpe + ficha de la celda (retorno, vol, maxDD, Kelly).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C2_GRID } from "./lesson-data";

function colorSharpe(s: number, max: number): string {
  const t = Math.max(0, Math.min(1, s / max));
  return s >= 1 ? `rgba(34,197,94,${(0.25 + 0.65 * t).toFixed(2)})` : `rgba(163,163,163,${(0.15 + 0.4 * t).toFixed(2)})`;
}

export default function C2L8Visual() {
  const maxSharpe = useMemo(() => Math.max(...C2_GRID.map((c) => c.sharpe)), []);
  const fasts = useMemo(() => [...new Set(C2_GRID.map((c) => c.fast))].sort((a, b) => a - b), []);
  const slows = useMemo(() => [...new Set(C2_GRID.map((c) => c.slow))].sort((a, b) => a - b), []);
  const [sel, setSel] = useState(() => C2_GRID.reduce((a, b) => (b.sharpe > a.sharpe ? b : a)));
  const robustas = C2_GRID.filter((c) => c.veredicto === "robusta").length;

  const celda = (f: number, s: number) => C2_GRID.find((c) => c.fast === f && c.slow === s);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">El grid no miente: Sharpe por (fast, slow)</p>
        <p className="academia-viz-sub">
          {C2_GRID.length} combinaciones · {robustas} robustas. Verde intenso = Sharpe alto.
          Toca una celda para auditarla: retorno, volatilidad, max DD y fracción de Kelly.
        </p>
      </Reveal>
      <Reveal retraso={140}>
        <table className="academia-heatmap" style={{ borderCollapse: "separate", borderSpacing: "4px", textAlign: "center" }} aria-label="Grid de Sharpe fast por slow">
          <thead>
            <tr>
              <th style={{ padding: "0.4rem 0.6rem" }}>fast ↓ · slow →</th>
              {slows.map((s) => (<th key={s} style={{ padding: "0.4rem 0.6rem" }}>{s}</th>))}
            </tr>
          </thead>
          <tbody>
            {fasts.map((f) => (
              <tr key={f}>
                <th style={{ padding: "0.4rem 0.6rem" }}>{f}</th>
                {slows.map((s) => {
                  const c = celda(f, s);
                  if (!c) return <td key={s} style={{ padding: "0.7rem 1rem", opacity: 0.25 }}>—</td>;
                  const activa = sel.fast === f && sel.slow === s;
                  return (
                    <td key={s} style={{ padding: 0 }}>
                      <button type="button" onClick={() => setSel(c)} title={`fast ${f} slow ${s}: Sharpe ${c.sharpe} · ${c.veredicto}`}
                        style={{
                          padding: "0.7rem 1rem", borderRadius: "0.5rem", fontWeight: 700, width: "100%",
                          background: colorSharpe(c.sharpe, maxSharpe), color: "#111",
                          border: activa ? "2px solid #245ce5" : "2px solid transparent", cursor: "pointer",
                        }}>
                        {c.sharpe.toFixed(2)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
      <Reveal retraso={220}>
        <p className="academia-viz-graf-titulo">Celda fast {sel.fast} · slow {sel.slow} · veredicto: {sel.veredicto}</p>
        <div className="academia-stat-grid academia-stat-grid-4">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sharpe</span><span className="academia-stat-valor academia-positivo"><CountUp valor={sel.sharpe} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Ret anual</span><span className="academia-stat-valor"><CountUp valor={sel.retAnual * 100} decimales={1} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Vol anual</span><span className="academia-stat-valor"><CountUp valor={sel.volAnual * 100} decimales={1} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Max DD</span><span className="academia-stat-valor academia-negativo"><CountUp valor={sel.maxDd * 100} decimales={1} sufijo=" %" /></span></div>
        </div>
        <div className="academia-stat-grid academia-stat-grid-3" style={{ marginTop: "0.6rem" }}>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Kelly completo (f*)</span><span className="academia-stat-valor">{sel.fKelly.toFixed(1)} %</span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Fracción objetivo</span><span className="academia-stat-valor">{(sel.fObjetivo * 100).toFixed(1)} %</span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Regla</span><span className="academia-stat-valor" style={{ fontSize: "0.9rem" }}>Nunca más de ¼ Kelly</span></div>
        </div>
      </Reveal>
    </div>
  );
}
