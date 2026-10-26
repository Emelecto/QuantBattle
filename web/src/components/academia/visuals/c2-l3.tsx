"use client";

/**
 * C2-L3 · Del bucle al vector — benchmark real en tu navegador: SMA(20) con
 * bucle Python-estilo vs pasada vectorizada, medido con performance.now().
 */
import { useMemo, useRef, useState } from "react";
import { AcademiaAreaChart, CountUp, Reveal } from "./charts";
import { C2_LOOKUP_CIERRES } from "./lesson-data";

function smaBucle(a: Float64Array, w: number): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    if (i < w - 1) { out[i] = NaN; continue; }
    let s = 0;
    for (let j = i - w + 1; j <= i; j++) s += a[j];
    out[i] = s / w;
  }
  return out;
}

function smaVector(a: Float64Array, w: number): Float64Array {
  const out = new Float64Array(a.length);
  const cumsum = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) cumsum[i + 1] = cumsum[i] + a[i];
  for (let i = 0; i < a.length; i++) {
    out[i] = i < w - 1 ? NaN : (cumsum[i + 1] - cumsum[i + 1 - w]) / w;
  }
  return out;
}

export default function C2L3Visual() {
  const datos = useMemo(() => C2_LOOKUP_CIERRES.map(([f, c]) => ({ tiempo: f, valor: c })), []);
  const [repeticiones, setRepeticiones] = useState(200);
  const [corriendo, setCorriendo] = useState(false);
  const [progBucle, setProgBucle] = useState(0);
  const [progVector, setProgVector] = useState(0);
  const [res, setRes] = useState<{ bucle: number; vector: number } | null>(null);
  const cancel = useRef(false);

  const correr = async () => {
    cancel.current = false;
    setCorriendo(true);
    setRes(null);
    setProgBucle(0);
    setProgVector(0);
    const base = new Float64Array(C2_LOOKUP_CIERRES.map(([, c]) => c));
    // Bucle por bloques para animar la barra sin congelar la UI.
    const t0 = performance.now();
    const bloque = Math.max(1, Math.floor(repeticiones / 20));
    for (let i = 0; i < repeticiones; i += bloque) {
      if (cancel.current) return;
      for (let k = 0; k < bloque && i + k < repeticiones; k++) smaBucle(base, 20);
      setProgBucle(Math.min(100, ((i + bloque) / repeticiones) * 100));
      await new Promise((r) => setTimeout(r, 30));
    }
    const tBucle = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < repeticiones; i++) smaVector(base, 20);
    const tVector = performance.now() - t1;
    setProgVector(100);
    setRes({ bucle: tBucle, vector: Math.max(tVector, 0.01) });
    setCorriendo(false);
  };

  const speedup = res ? res.bucle / res.vector : 0;
  const maxT = res ? Math.max(res.bucle, res.vector) : 1;

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Bucle vs vector: mídelo tú mismo</p>
        <p className="academia-viz-sub">
          SMA(20) sobre {C2_LOOKUP_CIERRES.length} cierres reales, repetida {repeticiones} veces.
          El bucle suma ventana por ventana; el vector usa suma acumulada (truco de NumPy).
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <p className="academia-viz-graf-titulo">Serie de trabajo · cierres</p>
        <AcademiaAreaChart datos={datos} altura={200} color="#245ce5" etiqueta="Cierre" formato={(v) => `$${v.toFixed(2)}`} />
      </Reveal>
      <Reveal retraso={200}>
        <div className="academia-control">
          <label htmlFor="ac-c2l3-rep">Repeticiones: {repeticiones}</label>
          <input id="ac-c2l3-rep" type="range" min={20} max={1000} step={20} value={repeticiones}
            onChange={(e) => setRepeticiones(Number(e.target.value))} className="academia-deslizador" disabled={corriendo} />
        </div>
        <button type="button" className="academia-btn" onClick={correr} disabled={corriendo}>
          {corriendo ? "Midiendo…" : "▶ Correr benchmark"}
        </button>
      </Reveal>
      <Reveal retraso={260}>
        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.8rem" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>🐢 Bucle anidado</span>
              <span>{res ? `${res.bucle.toFixed(1)} ms` : `${progBucle.toFixed(0)} %`}</span>
            </div>
            <div className="academia-barra-fondo"><div className="academia-barra-relleno academia-barra-lenta" style={{ width: `${res ? (res.bucle / maxT) * 100 : progBucle}%` }} /></div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>🚀 Vectorizado</span>
              <span>{res ? `${res.vector.toFixed(1)} ms` : `${progVector.toFixed(0)} %`}</span>
            </div>
            <div className="academia-barra-fondo"><div className="academia-barra-relleno" style={{ width: `${res ? Math.max((res.vector / maxT) * 100, 2) : progVector}%` }} /></div>
          </div>
        </div>
        {res && (
          <div className="academia-ev-resultado academia-ev-ventaja" style={{ marginTop: "0.8rem" }}>
            <span className="academia-ev-etiqueta">Aceleración medida</span>
            <span className="academia-ev-valor"><CountUp valor={speedup} decimales={1} prefijo="×" /></span>
            <span className="academia-ev-veredicto">Mismo resultado, {speedup.toFixed(0)}× más rápido. Así escala pandas/NumPy.</span>
          </div>
        )}
        <p className="academia-viz-nota">Medición real en tu navegador · varía con tu CPU y carga del sistema.</p>
      </Reveal>
    </div>
  );
}
