"use client";

/**
 * C6-L4 · Kelly fraccional — slider full / half / fijo.
 * Datos reales: 60 rondas de c6_l4.csv (corr media 0.029, vol media 0.158).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L4_RONDAS } from "./lesson-data";

export default function C6L4Visual() {
  const [modo, setModo] = useState<"full" | "half" | "fijo">("half");
  const [fijo, setFijo] = useState(25);
  const res = useMemo(() => {
    let eq = 100;
    const curva: number[] = [eq];
    for (const r of C6_L4_RONDAS) {
      const edge = Math.max(r.corr, 0);
      const kelly = edge / Math.max(r.vol ** 2, 1e-6);
      const f = modo === "full" ? Math.min(kelly, 1) : modo === "half" ? Math.min(kelly / 2, 0.5) : fijo / 100;
      eq *= 1 + f * r.corr * 2 - 0.0002;
      curva.push(eq);
    }
    return { final: eq, ret: (eq / 100 - 1) * 100, curva };
  }, [modo, fijo]);
  const max = Math.max(...res.curva), min = Math.min(...res.curva);
  const pts = res.curva.map((v, i) => `${(i / (res.curva.length - 1)) * 100},${34 - ((v - min) / Math.max(max - min, 1e-9)) * 30}`).join(" ");

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Kelly: tamaño según edge, no según euforia</p>
        <p className="academia-viz-sub">f* = edge / varianza. Full Kelly maximiza crecimiento pero duele; half Kelly recorta la volatilidad a la mitad del costo. 60 rondas reales de c6_l4.csv.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
          {(["full", "half", "fijo"] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} className="academia-btn" data-activo={modo === m}
              style={{ padding: "0.4rem 0.9rem", borderRadius: "8px", border: "1px solid #cddaea", background: modo === m ? "#245ce5" : "transparent", color: modo === m ? "#fff" : "inherit", cursor: "pointer" }}>
              {m === "full" ? "Full Kelly" : m === "half" ? "Half Kelly" : "Fijo"}
            </button>
          ))}
          {modo === "fijo" && (<label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>Stake fijo: {fijo}%<input type="range" min={5} max={100} step={5} value={fijo} onChange={(e) => setFijo(Number(e.target.value))} className="academia-deslizador" /></label>)}
        </div>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Equity final</span><span className="academia-stat-valor"><CountUp valor={res.final} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Retorno</span><span className={`academia-stat-valor ${res.ret >= 0 ? "academia-positivo" : "academia-negativo"}`}><CountUp valor={res.ret} decimales={2} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Rondas</span><span className="academia-stat-valor"><CountUp valor={C6_L4_RONDAS.length} decimales={0} /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <p className="academia-viz-graf-titulo">Equity simulado · {modo === "fijo" ? `fijo ${fijo}%` : modo}</p>
        <svg viewBox="0 0 100 36" style={{ width: "100%", height: "140px", background: "#f4f8fc", borderRadius: "8px" }}>
          <polyline points={pts} fill="none" stroke="#245ce5" strokeWidth="1.2" />
        </svg>
        <p className="academia-viz-nota">Con edge medio de 0.029, Full Kelly apuesta fuerte y se sacude; Half Kelly suaviza la curva. El stake fijo ignora el edge: igual tamaño con y sin ventaja.</p>
      </Reveal>
    </div>
  );
}
