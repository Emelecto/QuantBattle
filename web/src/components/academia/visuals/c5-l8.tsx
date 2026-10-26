"use client";

/**
 * C5-L8 · Pipeline a producción — checklist de deploy cuant.
 * Referencia de datos: 50 cierres de c5_l8.csv como serie a desplegar.
 */
import { useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C5_L8_CIERRES } from "./lesson-data";

const PASOS = [
  { id: "wf", titulo: "Walk-forward en verde (OOS > 0 en todos los folds)" },
  { id: "costos", titulo: "Sharpe neto positivo tras costos realistas" },
  { id: "papel", titulo: "2 semanas en paper trading sin intervención manual" },
  { id: "riesgo", titulo: "Stops y tamaño máximo por trade codificados" },
  { id: "kill", titulo: "Kill-switch automático ante drawdown límite" },
  { id: "monitor", titulo: "Monitor de IC y drift con alertas activas" },
];

export default function C5L8Visual() {
  const [hechos, setHechos] = useState<string[]>(["wf"]);
  const progreso = Math.round((hechos.length / PASOS.length) * 100);

  const alternar = (id: string) =>
    setHechos((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Pipeline a producción</p>
        <p className="academia-viz-sub">
          Antes de arriesgar capital con la serie ({C5_L8_CIERRES.length} cierres, c5_l8.csv),
          cada compuerta debe estar en verde. Sin excepciones.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Listo para producción</span>
            <span><CountUp valor={progreso} decimales={0} sufijo=" %" /></span>
          </div>
          <div className="academia-barra-fondo" aria-label={`Progreso ${progreso}%`}>
            <div className="academia-barra-relleno" style={{ width: `${progreso}%` }} />
          </div>
          {progreso === 100 && <p style={{ color: "#087951", fontSize: "0.9rem" }}>✓ Despliega con tamaño reducido y vigilancia diaria las primeras 2 semanas.</p>}
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {PASOS.map((p, i) => {
            const ok = hechos.includes(p.id);
            return (
              <li key={p.id} className={`academia-paso${ok ? " academia-paso-ok" : ""}`}>
                <label style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={ok} onChange={() => alternar(p.id)} aria-label={p.titulo} />
                  <span><strong>{i + 1}. {p.titulo}</strong></span>
                </label>
              </li>
            );
          })}
        </ol>
        {progreso < 100 && <p className="academia-viz-nota">⛔ Faltan {PASOS.length - hechos.length} compuertas: desplegar ahora es apostar, no operar.</p>}
      </Reveal>
    </div>
  );
}
