"use client";

/**
 * C6-L8 · Kill-switch demo — se dispara en −2 %.
 * Datos reales: 45 días de c6_l8.csv (drawdown mín −9.95 %, 3 días con kill).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C6_L8_DIARIO } from "./lesson-data";

export default function C6L8Visual() {
  const [limite, setLimite] = useState(2);
  const [hasta, setHasta] = useState(45);
  const dias = useMemo(() => C6_L8_DIARIO.slice(0, hasta), [hasta]);
  const { eq, ddMin, disparos } = useMemo(() => {
    let e = 100, pico = 100, dd = 0, n = 0;
    const curva: number[] = [];
    for (const d of dias) {
      const muerto = dd <= -limite;
      e *= muerto ? 1 : 1 + d.pnl / 100;
      pico = Math.max(pico, e);
      dd = (e / pico - 1) * 100;
      if (dd <= -limite) n++;
      curva.push(e);
    }
    return { eq: e, ddMin: Math.min(...curva.map((v, i) => (v / Math.max(...curva.slice(0, i + 1)) - 1) * 100)), disparos: n, curva };
  }, [dias, limite]);
  void ddMin;
  const minDdReal = Math.min(...dias.map((d) => d.dd));
  const max = Math.max(...dias.map((_, i) => dias.slice(0, i + 1).reduce((s, d) => s + d.pnl, 100)));
  void max;
  const curva = useMemo(() => {
    return dias.reduce<number[]>((values, d) => { values.push((values.at(-1) ?? 100) * (100 + d.pnl) / 100); return values; }, []);
  }, [dias]);
  const cMax = Math.max(...curva), cMin = Math.min(...curva);
  const pts = curva.map((v, i) => `${(i / Math.max(curva.length - 1, 1)) * 100},${34 - ((v - cMin) / Math.max(cMax - cMin, 1e-9)) * 30}`).join(" ");

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Kill-switch: el freno que te salva de ti</p>
        <p className="academia-viz-sub">Si el drawdown toca el límite, se pausa todo. Sin discusión, sin “una más”. 45 días reales de c6_l8.csv con drawdown mínimo de −9.95 %.</p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ display: "grid", gap: "0.6rem", marginBottom: "0.8rem" }}>
          <label htmlFor="ac-c6l8-l">Límite kill-switch: −{limite.toFixed(1)} %</label>
          <input id="ac-c6l8-l" type="range" min={1} max={5} step={0.5} value={limite} onChange={(e) => setLimite(Number(e.target.value))} className="academia-deslizador" />
          <label htmlFor="ac-c6l8-h">Días visibles: {hasta}</label>
          <input id="ac-c6l8-h" type="range" min={5} max={45} step={1} value={hasta} onChange={(e) => setHasta(Number(e.target.value))} className="academia-deslizador" />
        </div>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Equity</span><span className="academia-stat-valor"><CountUp valor={eq} decimales={2} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">DD mín real</span><span className="academia-stat-valor academia-negativo"><CountUp valor={minDdReal} decimales={2} sufijo=" %" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Días detenido</span><span className={`academia-stat-valor ${disparos > 0 ? "academia-negativo" : "academia-positivo"}`}><CountUp valor={disparos} decimales={0} /></span></div>
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <svg viewBox="0 0 100 36" style={{ width: "100%", height: "140px", background: "#f4f8fc", borderRadius: "8px" }}>
          <polyline points={pts} fill="none" stroke={disparos > 0 ? "#af3f4f" : "#087951"} strokeWidth="1.2" />
        </svg>
        <p className="academia-viz-nota" style={{ marginTop: "0.5rem" }}>
          {disparos > 0 ? `⛔ Kill-switch activo: con límite −${limite.toFixed(1)} % el sistema se habría detenido ${disparos} días. Eso es capital salvado.` : `✓ Con límite −${limite.toFixed(1)} % y ${hasta} días no se dispara. Ojo: a 45 días el DD real llegó a −9.95 %.`}
        </p>
      </Reveal>
    </div>
  );
}
