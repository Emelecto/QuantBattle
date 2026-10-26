"use client";

/**
 * C4-L7 · Checklist pre-trade interactivo — sin check completo no hay trade.
 * Evidencia (c4_l7.csv): con plan WR 63.3 % (30 trades) vs sin plan 30 % (20).
 */
import { useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C4_PLAN } from "./lesson-data";

const ITEMS = [
  { id: "tendencia", texto: "La dirección está a favor de la tendencia marco" },
  { id: "nivel", texto: "Entrada en nivel planeado, no en persecución" },
  { id: "stop", texto: "Stop definido antes de entrar y tamaño calculado" },
  { id: "rr", texto: "R:R mínimo 1.5:1 hacia el objetivo" },
  { id: "noticias", texto: "Sin noticias de alto impacto en los próximos 30 min" },
  { id: "mente", texto: "Estado mental calmado, fuera de tilt" },
];

export default function C4L7Visual() {
  const [hechos, setHechos] = useState<string[]>([]);
  const progreso = Math.round((hechos.length / ITEMS.length) * 100);
  const listo = progreso === 100;

  const alternar = (id: string) =>
    setHechos((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Checklist pre-trade</p>
        <p className="academia-viz-sub">
          Seis filtros, cero excepciones: si uno falla, el trade no existe. La disciplina se mide en trades evitados.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Filtros superados</span>
            <span><CountUp valor={progreso} decimales={0} sufijo=" %" /></span>
          </div>
          <div className="academia-barra-fondo" aria-label={`Progreso ${progreso}%`}>
            <div className="academia-barra-relleno" style={{ width: `${progreso}%` }} />
          </div>
          <p style={{ fontSize: "0.9rem", color: listo ? "#087951" : "#a96b16" }}>
            {listo ? "✓ Luz verde: trade autorizado por tu plan." : "⏳ Trade bloqueado hasta completar los 6 filtros."}
          </p>
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {ITEMS.map((p, i) => {
            const ok = hechos.includes(p.id);
            return (
              <li key={p.id} className={`academia-paso${ok ? " academia-paso-ok" : ""}`}>
                <label style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={ok} onChange={() => alternar(p.id)} aria-label={p.texto} />
                  <span><strong>{i + 1}. {p.texto}</strong></span>
                </label>
              </li>
            );
          })}
        </ol>
      </Reveal>
      <Reveal retraso={200}>
        <p className="academia-viz-graf-titulo">Por qué importa · plan vs improvisación</p>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">WR con plan ({C4_PLAN.conPlan.n})</span><span className="academia-stat-valor academia-positivo"><CountUp valor={C4_PLAN.conPlan.wr} decimales={1} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">WR sin plan ({C4_PLAN.sinPlan.n})</span><span className="academia-stat-valor academia-negativo"><CountUp valor={C4_PLAN.sinPlan.wr} decimales={1} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Ventaja del plan</span><span className="academia-stat-valor academia-positivo"><CountUp valor={C4_PLAN.conPlan.wr - C4_PLAN.sinPlan.wr} decimales={1} prefijo="+" sufijo=" pp" /></span></div>
        </div>
        <p className="academia-viz-nota">Datos c4_l7.csv: el mismo trader duplica su acierto cuando sigue el plan.</p>
      </Reveal>
    </div>
  );
}
