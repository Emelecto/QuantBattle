"use client";

/**
 * C6-L1 · Submission por eras — validador CSV id,prediction.
 * Datos reales: muestra + resumen de c6_l1.csv (60 filas, 12 eras x 5 activos).
 */
import { useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L1_MUESTRA, C6_L1_RESUMEN } from "./lesson-data";

export default function C6L1Visual() {
  const [texto, setTexto] = useState("id,prediction\nactivo_001,0.61\nactivo_002,0.40\nactivo_003,0.16");
  const veredicto = (() => {
    const lineas = texto.trim().split(/\n+/);
    if (lineas.length < 2) return { ok: false, msg: "Pega un CSV con cabecera id,prediction y al menos 1 fila." };
    const cab = lineas[0].trim().toLowerCase();
    if (cab !== "id,prediction") return { ok: false, msg: `Cabecera inválida: "${lineas[0].trim()}". Debe ser exactamente id,prediction.` };
    for (let i = 1; i < lineas.length; i++) {
      const partes = lineas[i].split(",");
      if (partes.length !== 2 || !partes[0].trim()) return { ok: false, msg: `Fila ${i} mal formada: "${lineas[i]}".` };
      const v = Number(partes[1]);
      if (!Number.isFinite(v)) return { ok: false, msg: `Fila ${i}: prediction no numérico ("${partes[1]}").` };
    }
    return { ok: true, msg: `Válido: ${lineas.length - 1} predicciones, 0 errores. Formato listo para enviar.` };
  })();

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Submission por eras: id,prediction</p>
        <p className="academia-viz-sub">El torneo evalúa por eras (rondas semanales). Cada submission es un CSV con una predicción por activo, sin mirar el futuro de esa era. Datos de c6_l1.csv.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Filas</span><span className="academia-stat-valor"><CountUp valor={C6_L1_RESUMEN.filas} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Eras</span><span className="academia-stat-valor"><CountUp valor={C6_L1_RESUMEN.eras} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Activos / era</span><span className="academia-stat-valor"><CountUp valor={C6_L1_RESUMEN.porEra} decimales={0} /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <p className="academia-viz-graf-titulo">Muestra real · primeras 8 filas</p>
        <div className="academia-tabla-scroll">
          <table className="academia-tabla">
            <thead><tr><th>Era</th><th>ID</th><th>Feat A</th><th>Feat B</th><th>Target</th></tr></thead>
            <tbody>{C6_L1_MUESTRA.map((f) => (<tr key={f.id}><td>{f.era}</td><td>{f.id}</td><td>{f.featureA.toFixed(2)}</td><td>{f.featureB.toFixed(2)}</td><td>{f.target.toFixed(2)}</td></tr>))}</tbody>
          </table>
        </div>
      </Reveal>
      <Reveal retraso={280}>
        <p className="academia-viz-graf-titulo">Validador de submission</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} spellCheck={false}
          style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem", background: "#e9f0f7", color: "inherit", border: "1px solid #dce6ef", borderRadius: "8px", padding: "0.6rem" }} />
        <p className={veredicto.ok ? "academia-positivo" : "academia-negativo"} style={{ marginTop: "0.5rem" }}>{veredicto.ok ? "✓ " : "✗ "}{veredicto.msg}</p>
        <p className="academia-viz-nota">Regla de oro: una predicción por activo de la era, cabecera exacta, sin NaN. Si falla el formato, el torneo rechaza todo el envío.</p>
      </Reveal>
    </div>
  );
}
