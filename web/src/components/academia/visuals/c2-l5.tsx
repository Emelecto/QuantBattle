"use client";

/**
 * C2-L5 · Visor de klines — 50 velas diarias BTC (c2_l5.csv) con
 * lightweight-charts + deslizador de ventana y lectura OHLCV de la última vela.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { CountUp, Reveal } from "./charts";
import { C2_KLINES } from "./lesson-data";

function aUtc(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

export default function C2L5Visual() {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ventana, setVentana] = useState(50);

  const velas = useMemo(
    () =>
      C2_KLINES.map(([t, o, h, l, c]) => ({ time: aUtc(t), open: o, high: h, low: l, close: c })),
    [],
  );
  const visibles = useMemo(() => velas.slice(-ventana), [velas, ventana]);
  const ultima = C2_KLINES[C2_KLINES.length - 1];
  const cambio = ((ultima[4] / ultima[1] - 1) * 100);

  useEffect(() => {
    const el = contenedor.current;
    if (!el || visibles.length === 0) return;
    const chart = createChart(el, {
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#52677d",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#e9f0f7" },
        horzLines: { color: "#e9f0f7" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
    });
    const serie = chart.addSeries(CandlestickSeries, {
      upColor: "#087951",
      downColor: "#af3f4f",
      wickUpColor: "#087951",
      wickDownColor: "#af3f4f",
      borderVisible: false,
    });
    serie.setData(visibles);
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (contenedor.current) chart.applyOptions({ width: contenedor.current.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [visibles]);

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Visor de klines BTC</p>
        <p className="academia-viz-sub">
          {C2_KLINES.length} velas diarias (open/high/low/close + volumen). Verde = cerró arriba de la
          apertura; mecha = rango real negociado. Mueve la ventana para hacer zoom temporal.
        </p>
      </Reveal>
      <Reveal retraso={140}>
        <div className="academia-control">
          <label htmlFor="ac-c2l5-vent">Últimas {ventana} velas</label>
          <input id="ac-c2l5-vent" type="range" min={10} max={50} step={1} value={ventana}
            onChange={(e) => setVentana(Number(e.target.value))} className="academia-deslizador" />
        </div>
        <div ref={contenedor} className="academia-chart-contenedor" style={{ height: 300 }} />
      </Reveal>
      <Reveal retraso={220}>
        <div className="academia-stat-grid academia-stat-grid-4">
          <div className="academia-stat"><span className="academia-stat-etiqueta">Apertura</span><span className="academia-stat-valor"><CountUp valor={ultima[1]} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Máximo</span><span className="academia-stat-valor academia-positivo"><CountUp valor={ultima[2]} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Mínimo</span><span className="academia-stat-valor academia-negativo"><CountUp valor={ultima[3]} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat">
            <span className="academia-stat-etiqueta">Cierre (% día)</span>
            <span className={`academia-stat-valor ${cambio >= 0 ? "academia-positivo" : "academia-negativo"}`}>
              <CountUp valor={cambio} decimales={2} prefijo={cambio >= 0 ? "+" : ""} sufijo=" %" />
            </span>
          </div>
        </div>
        <p className="academia-viz-nota">Última vela: {ultima[0].slice(0, 10)} · vol {ultima[5].toFixed(1)} BTC.</p>
      </Reveal>
    </div>
  );
}
