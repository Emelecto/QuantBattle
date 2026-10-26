"use client";

/**
 * C4-L6 · Registro emocional anti-tilt — checklist de pausa + evidencia real.
 * Base (c4_l6.csv): días en tilt 15/63 impulsivas/−26 % vs calmado 20/0/+13 %.
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C4_EMOCIONES } from "./lesson-data";

const PAUSA = [
  { id: "respira", texto: "Pausa 10 minutos lejos de la pantalla" },
  { id: "anota", texto: "Anota qué sientes y qué te disparó" },
  { id: "revisa", texto: "Relee tu plan: ¿este trade existe en él?" },
  { id: "reduce", texto: "Si operas, reduce el tamaño a la mitad" },
  { id: "cierra", texto: "Tras 2 pérdidas seguidas, cierra la sesión" },
];

export default function C4L6Visual() {
  const [hechos, setHechos] = useState<string[]>([]);
  const [estado, setEstado] = useState<"calmado" | "ansioso" | "tilt">("ansioso");

  const progreso = Math.round((hechos.length / PAUSA.length) * 100);
  const dato = C4_EMOCIONES[estado];

  const comparativa = useMemo(() => {
    const pnlPorDia = (e: keyof typeof C4_EMOCIONES) => C4_EMOCIONES[e].pnl / C4_EMOCIONES[e].dias;
    return { tiltDia: pnlPorDia("tilt"), calmaDia: pnlPorDia("calmado") };
  }, []);

  const alternar = (id: string) =>
    setHechos((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Protocolo anti-tilt</p>
        <p className="academia-viz-sub">
          El tilt no se controla con fuerza de voluntad sino con un protocolo. Elige tu estado y completa la pausa.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}>
          {(["calmado", "ansioso", "tilt"] as const).map((e) => (
            <button key={e} type="button" onClick={() => setEstado(e)}
              className={estado === e ? "academia-btn-mini academia-btn-activo" : "academia-btn-mini"}
              aria-pressed={estado === e}>
              {e === "calmado" ? "😌 Calmado" : e === "ansioso" ? "😟 Ansioso" : "🤬 Tilt"}
            </button>
          ))}
        </div>
        <div className="academia-stat-grid academia-stat-grid-3" style={{ marginBottom: "0.8rem" }}>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Días en {estado}</span><span className="academia-stat-valor"><CountUp valor={dato.dias} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Trades impulsivos</span><span className="academia-stat-valor"><CountUp valor={dato.impulsivas} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">PnL acumulado</span><span className={`academia-stat-valor ${dato.pnl >= 0 ? "academia-positivo" : "academia-negativo"}`}><CountUp valor={dato.pnl} decimales={1} prefijo={dato.pnl >= 0 ? "+" : ""} sufijo=" %" /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-control" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Checklist de pausa</span>
            <span><CountUp valor={progreso} decimales={0} sufijo=" %" /></span>
          </div>
          <div className="academia-barra-fondo" aria-label={`Progreso ${progreso}%`}>
            <div className="academia-barra-relleno" style={{ width: `${progreso}%` }} />
          </div>
          {progreso === 100 && <p style={{ color: "#087951", fontSize: "0.9rem" }}>✓ Protocolo completo: solo vuelve si el trade está en tu plan.</p>}
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {PAUSA.map((p, i) => {
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
        <p className="academia-viz-nota">Evidencia (c4_l6.csv): día en tilt promedia {comparativa.tiltDia.toFixed(2)} % vs día calmado {comparativa.calmaDia >= 0 ? "+" : ""}{comparativa.calmaDia.toFixed(2)} %.</p>
      </Reveal>
    </div>
  );
}
