"use client";

/**
 * C5-L5 · MLP vs secuencial — hit-rate direccional.
 * Serie: muestra de c5_l5.csv. Hit-rate ilustrativo (ver lección).
 */
import { useMemo, useState } from "react";
import { AcademiaAreaChart, CountUp, Reveal } from "./charts";
import { C5_L5_CIERRES, C5_L5_HITRATE } from "./lesson-data";

export default function C5L5Visual() {
  const [modelo, setModelo] = useState("Secuencial");
  const sel = C5_L5_HITRATE.find((m) => m.modelo === modelo) ?? C5_L5_HITRATE[0];

  const datos = useMemo(() => {
    const base = Date.UTC(2026, 0, 1);
    return C5_L5_CIERRES.map((v, i) => ({
      tiempo: new Date(base + i * 86400000).toISOString().slice(0, 10),
      valor: v,
    }));
  }, []);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">MLP vs modelo secuencial</p>
        <p className="academia-viz-sub">
          Predecir la dirección del día siguiente ({C5_L5_CIERRES.length} cierres, c5_l5.csv).
          El secuencial recuerda el orden de la serie; el MLP solo ve una foto fija.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <AcademiaAreaChart datos={datos} color="#087951" etiqueta="Cierre" />
      </Reveal>
      <Reveal retraso={180}>
        <div className="academia-filtros" role="group" aria-label="Selector de modelo">
          {C5_L5_HITRATE.map((m) => (
            <button key={m.modelo} type="button"
              className={`academia-chip${m.modelo === modelo ? " academia-chip-activo" : ""}`}
              onClick={() => setModelo(m.modelo)}>{m.modelo}</button>
          ))}
        </div>
        <div className="academia-stat-grid academia-stat-grid-3" style={{ marginTop: "0.8rem" }}>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Hit-rate</span>
            <span className="academia-stat-valor academia-positivo"><CountUp valor={sel.hit} decimales={1} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sobre moneda</span>
            <span className="academia-stat-valor"><CountUp valor={sel.hit - 50} decimales={1} prefijo="+" sufijo=" pp" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Azar = 50 %</span><span className="academia-stat-valor">50.0 %</span></div>
        </div>
        <p className="academia-viz-nota">
          {modelo === "Secuencial"
            ? "El secuencial supera al MLP por 4.5 pp: el orden temporal sí aporta señal."
            : "El MLP apenas bate al azar: sin memoria de secuencia, casi no hay edge."}
        </p>
      </Reveal>
    </div>
  );
}
