"use client";

/**
 * C4-L3 · Montecarlo — 20 trayectorias remuestreadas de 50 retornos diarios reales.
 * Base (c4_l3.csv): maxDD −4.56 %, equity final 11 164 desde 10 000.
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C4_MONTECARLO_RETS, C4_MONTECARLO_RESUMEN } from "./lesson-data";

function mulberry(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function C4L3Visual() {
  const [semilla, setSemilla] = useState(7);

  const paths = useMemo(() => {
    const N = 20;
    const out: { puntos: number[]; maxDd: number; final: number }[] = [];
    for (let p = 0; p < N; p++) {
      const rnd = mulberry(semilla * 1000 + p);
      const idx = C4_MONTECARLO_RETS.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      let eq = 10000; let peak = 10000; let maxDd = 0;
      const puntos = [eq];
      for (const i of idx) {
        eq *= 1 + C4_MONTECARLO_RETS[i];
        peak = Math.max(peak, eq);
        maxDd = Math.min(maxDd, (eq / peak - 1) * 100);
        puntos.push(eq);
      }
      out.push({ puntos, maxDd, final: eq });
    }
    return out;
  }, [semilla]);

  const resumen = useMemo(() => {
    const finales = paths.map((p) => p.final).sort((a, b) => a - b);
    const peorDd = Math.min(...paths.map((p) => p.maxDd));
    const mediana = finales[Math.floor(finales.length / 2)];
    const positivas = paths.filter((p) => p.final > 10000).length;
    return { peorDd, mediana, positivas };
  }, [paths]);

  const W = 600; const H = 220;
  const todos = paths.flatMap((p) => p.puntos);
  const min = Math.min(...todos); const max = Math.max(...todos);
  const aXY = (i: number, v: number) => {
    const x = (i / 50) * W;
    const y = H - ((v - min) / Math.max(1e-9, max - min)) * (H - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Montecarlo: 20 futuros posibles</p>
        <p className="academia-viz-sub">
          Mismo desempeño diario, distinto orden. Si el peor escenario te quiebra, el tamaño es excesivo.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ marginBottom: "0.8rem" }}>
          <button type="button" className="academia-btn-mini" onClick={() => setSemilla((s) => s + 1)}>
            ↻ Nuevos escenarios
          </button>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="academia-graf" role="img" aria-label="20 trayectorias Montecarlo">
          {paths.map((p, i) => (
            <polyline key={i} points={p.puntos.map((v, j) => aXY(j, v)).join(" ")}
              fill="none" stroke={p.final >= 10000 ? "#087951" : "#af3f4f"} strokeOpacity={0.55} strokeWidth={1.4} />
          ))}
        </svg>
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Peor maxDD simulado</span><span className="academia-stat-valor academia-negativo"><CountUp valor={resumen.peorDd} decimales={2} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Equity final (mediana)</span><span className="academia-stat-valor"><CountUp valor={resumen.mediana} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Escenarios positivos</span><span className="academia-stat-valor"><CountUp valor={resumen.positivas} decimales={0} sufijo=" / 20" /></span></div>
        </div>
        <p className="academia-viz-nota">Serie real (c4_l3.csv): maxDD {C4_MONTECARLO_RESUMEN.maxDd} % · equity final ${C4_MONTECARLO_RESUMEN.equityFinal.toLocaleString("es-MX")}.</p>
      </Reveal>
    </div>
  );
}
