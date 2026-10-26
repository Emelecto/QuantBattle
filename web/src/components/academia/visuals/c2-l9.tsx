"use client";

/**
 * C2-L9 · Pipeline final — checklist de 6 etapas sobre ETH real (90 sesiones,
 * c2_l9_eth.csv): cada etapa verificada desbloquea la siguiente, con mini equity.
 */
import { useMemo, useState } from "react";
import { AcademiaAreaChart, CountUp, Reveal } from "./charts";
import { C2_PIPELINE_ETH } from "./lesson-data";

const ETAPAS = [
  { id: "datos", titulo: "Datos: OHLCV limpio y con timezone", detalle: "90 cierres ETH sin huecos ni duplicados." },
  { id: "limpieza", titulo: "Limpieza: gaps y outliers tratados", detalle: "Resampleo 1D + ffill documentado, retornos winsorizados." },
  { id: "senal", titulo: "Señal: SMA(10/30) sin look-ahead", detalle: "La señal de hoy solo usa cierres hasta hoy." },
  { id: "costes", titulo: "Costes: 10 bps por lado incluidos", detalle: "Equity neto, no bruto. El bruto es marketing." },
  { id: "wf", titulo: "Walk-forward: OOS confirma", detalle: "Al menos 2 folds con Sharpe OOS > 0." },
  { id: "tamano", titulo: "Tamaño: ¼ Kelly como techo", detalle: "Fracción fija pequeña; sobrevivir > brillar." },
];

export default function C2L9Visual() {
  const [hechas, setHechas] = useState<string[]>(["datos", "limpieza"]);
  const progreso = Math.round((hechas.length / ETAPAS.length) * 100);

  const serie = useMemo(() => {
    const px = C2_PIPELINE_ETH.map(([, p]) => p);
    const out: { tiempo: string; valor: number }[] = [];
    let eq = 10000;
    let pos = 0;
    const sma = (w: number, i: number): number | null => {
      if (i < w - 1) return null;
      let s = 0;
      for (let j = i - w + 1; j <= i; j++) s += px[j];
      return s / w;
    };
    for (let i = 1; i < px.length; i++) {
      const f = sma(10, i); const s = sma(30, i);
      const fp = sma(10, i - 1); const sp = sma(30, i - 1);
      if (f != null && s != null && fp != null && sp != null) {
        if (pos === 0 && fp <= sp && f > s) { pos = 1; eq *= 1 - 0.001; }
        else if (pos === 1 && fp >= sp && f < s) { pos = 0; eq *= 1 - 0.001; }
      }
      eq *= 1 + pos * (px[i] / px[i - 1] - 1);
      out.push({ tiempo: C2_PIPELINE_ETH[i][0], valor: eq });
    }
    return out;
  }, []);

  const equityFinal = serie[serie.length - 1].valor;
  const retNeto = (equityFinal / 10000 - 1) * 100;

  const puedeMarcar = (idx: number) => idx === 0 || hechas.includes(ETAPAS[idx - 1].id);
  const alternar = (idx: number, id: string) => {
    if (!hechas.includes(id) && !puedeMarcar(idx)) return;
    setHechas((h) => (h.includes(id) ? h.filter((x) => ETAPAS.findIndex((e) => e.id === x) < idx) : [...h, id]));
  };

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Pipeline cuant de punta a punta</p>
        <p className="academia-viz-sub">
          Estrategia SMA(10/30) en ETH · {C2_PIPELINE_ETH.length} sesiones · 10 bps por lado.
          Las etapas son secuenciales: sin datos limpios no hay señal que valga.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-graf-titulo">Equity neto del pipeline</p>
        <AcademiaAreaChart datos={serie} altura={220} color="#087951" etiqueta="Equity" formato={(v) => `$${v.toFixed(0)}`} />
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-stat-grid academia-stat-grid-3">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Etapas listas</span><span className="academia-stat-valor"><CountUp valor={hechas.length} decimales={0} sufijo={`/${ETAPAS.length}`} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Equity final neto</span><span className="academia-stat-valor"><CountUp valor={equityFinal} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Retorno neto</span>
            <span className={`academia-stat-valor ${retNeto >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={retNeto} decimales={1} prefijo={retNeto >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
        </div>
        <div className="academia-barra-fondo" style={{ marginTop: "0.8rem" }} aria-label={`Progreso ${progreso}%`}>
          <div className="academia-barra-relleno" style={{ width: `${progreso}%` }} />
        </div>
      </Reveal>
      <Reveal retraso={280}>
        <ol style={{ listStyle: "none", padding: 0, margin: "0.8rem 0 0", display: "grid", gap: "0.6rem" }}>
          {ETAPAS.map((e, i) => {
            const ok = hechas.includes(e.id);
            const bloqueada = !ok && !puedeMarcar(i);
            return (
              <li key={e.id} className={`academia-paso${ok ? " academia-paso-ok" : ""}${bloqueada ? " academia-paso-bloq" : ""}`}>
                <label style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", cursor: bloqueada ? "not-allowed" : "pointer", opacity: bloqueada ? 0.55 : 1 }}>
                  <input type="checkbox" checked={ok} disabled={bloqueada} onChange={() => alternar(i, e.id)} aria-label={e.titulo} />
                  <span>
                    <strong>{ok ? "✓" : bloqueada ? "🔒" : `${i + 1}.`} {e.titulo}</strong>
                    <span className="academia-viz-sub" style={{ display: "block", margin: "0.15rem 0 0" }}>{e.detalle}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
        {progreso === 100 && <p style={{ color: "#087951" }}>✓ Pipeline completo: estrategia lista para paper trading, no para el Lambo.</p>}
      </Reveal>
    </div>
  );
}
