"use client";

/**
 * C5-L9 · Monitoreo — semáforo de IC y drift con valores reales de c5_l9.csv.
 */
import { CountUp, Reveal } from "./charts";
import { C5_L9_MONITOREO } from "./lesson-data";

function Semaforo({ estado, titulo, detalle }: { estado: "verde" | "amarillo" | "rojo"; titulo: string; detalle: string }) {
  const color = estado === "verde" ? "#087951" : estado === "amarillo" ? "#a96b16" : "#af3f4f";
  return (
    <div className="academia-stat" style={{ borderLeft: `4px solid ${color}` }}>
      <span className="academia-stat-etiqueta">{titulo}</span>
      <span className="academia-stat-valor" style={{ color }}>{estado === "verde" ? "● VERDE" : estado === "amarillo" ? "● AMARILLO" : "● ROJO"}</span>
      <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>{detalle}</span>
    </div>
  );
}

export default function C5L9Visual() {
  const { ic, mediaPrimera, mediaSegunda } = C5_L9_MONITOREO;
  const drift = Math.abs(mediaSegunda - mediaPrimera);

  const estIC = ic >= 0.1 ? "verde" : ic >= 0 ? "amarillo" : "rojo";
  const estDrift = drift < 0.3 ? "verde" : drift < 0.6 ? "amarillo" : "rojo";
  const rojos = [estIC, estDrift].filter((e) => e === "rojo").length;
  const general = rojos > 0 ? "ROJO — pausa y recalibra" : "VERDE — opera normal";

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Semáforo de IC y drift</p>
        <p className="academia-viz-sub">
          Un modelo en producción se vigila como un paciente: correlación señal-retorno (IC)
          y deriva del régimen. Valores calculados de c5_l9.csv.
        </p>
      </Reveal>
      <Reveal retraso={140}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">IC lag-1</span><span className="academia-stat-valor"><CountUp valor={ic} decimales={3} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Media 1ª mitad</span><span className="academia-stat-valor"><CountUp valor={mediaPrimera} decimales={2} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Media 2ª mitad</span><span className="academia-stat-valor"><CountUp valor={mediaSegunda} decimales={2} sufijo=" %" /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={220}>
        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.8rem" }}>
          <Semaforo estado={estIC} titulo="IC señal → retorno" detalle={`IC = ${ic.toFixed(3)} (verde ≥ 0.10)`} />
          <Semaforo estado={estDrift} titulo="Drift de régimen" detalle={`|Δ medias| = ${drift.toFixed(2)} pp (verde < 0.30)`} />
        </div>
        <p className="academia-viz-nota" style={{ marginTop: "0.8rem" }}>
          Estado general: <strong>{general}</strong>. En amarillo se reduce tamaño a la mitad; en rojo se pausa.
        </p>
      </Reveal>
    </div>
  );
}
