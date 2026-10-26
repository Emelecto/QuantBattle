"use client";

/**
 * Academia charts — envoltorios livianos sobre lightweight-charts (v5),
 * con el mismo patrón de QuantChart/MiniCharts: fondo transparente, tipografía
 * mono, crosshair con tooltip propio y limpieza en el unmount.
 * Más Reveal (aparición por scroll) y CountUp (conteo animado una sola vez).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type TiempoValor = { tiempo: string; valor: number };

function aUtc(fecha: string): UTCTimestamp {
  const [y, m, d] = fecha.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 1000) as UTCTimestamp;
}

function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[(m ?? 1) - 1] ?? ""} ${y}`;
}

export function AcademiaAreaChart({
  datos,
  altura = 260,
  color = "#245ce5",
  etiqueta = "Valor",
  formato = (v: number) => v.toFixed(2),
}: {
  datos: TiempoValor[];
  altura?: number;
  color?: string;
  etiqueta?: string;
  formato?: (v: number) => string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const serie = useRef<ISeriesApi<"Area"> | null>(null);
  const formatoRef = useRef(formato);
  formatoRef.current = formato;
  const etiquetaRef = useRef(etiqueta);
  etiquetaRef.current = etiqueta;
  const [tip, setTip] = useState<{ x: number; y: number; fecha: string; valor: number } | null>(null);

  const puntos = useMemo(
    () =>
      datos
        .filter((d) => Number.isFinite(d.valor))
        .map((d) => ({ time: aUtc(d.tiempo), value: d.valor, fecha: d.tiempo })),
    [datos],
  );

  useEffect(() => {
    const el = contenedor.current;
    if (!el || puntos.length === 0) return;
    const chart = createChart(el, {
      height: altura,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#52677d",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#e3ebf4" },
        horzLines: { color: "#e3ebf4" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        vertLine: { color: "#8ca9c9", labelBackgroundColor: "#245ce5" },
        horzLine: { color: "#8ca9c9", labelBackgroundColor: "#245ce5" },
      },
      handleScale: { axisPressedMouseMove: false },
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}2e`,
      bottomColor: `${color}05`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    area.setData(puntos.map(({ time, value }) => ({ time, value })));
    serie.current = area;
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setTip(null);
        return;
      }
      const v = (param.seriesData.get(area) as { value?: number } | undefined)?.value;
      if (v == null) {
        setTip(null);
        return;
      }
      const original = puntos.find((p) => p.time === param.time);
      setTip({
        x: param.point.x,
        y: param.point.y,
        fecha: original ? fechaCorta(original.fecha) : "",
        valor: v,
      });
    });

    const ro = new ResizeObserver(() => {
      if (contenedor.current) chart.applyOptions({ width: contenedor.current.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      serie.current = null;
    };
  }, [puntos, altura, color]);

  if (puntos.length === 0) {
    return (
      <div className="academia-viz-vacio" style={{ height: altura }}>
        Sin datos suficientes para graficar.
      </div>
    );
  }

  return (
    <div className="academia-chart-rel">
      <div ref={contenedor} className="academia-chart-contenedor" style={{ height: altura }} />
      {tip && (
        <div
          className="academia-chart-tip"
          style={{
            left: Math.min(tip.x + 12, (contenedor.current?.clientWidth ?? 400) - 180),
            top: Math.max(tip.y - 56, 8),
          }}
        >
          <div className="academia-chart-tip-fecha">{tip.fecha}</div>
          <div className="academia-chart-tip-valor">
            {etiquetaRef.current} {formatoRef.current(tip.valor)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Conteo animado de 0 → valor la primera vez que aparece en pantalla. */
export function CountUp({
  valor,
  decimales = 2,
  prefijo = "",
  sufijo = "",
}: {
  valor: number;
  decimales?: number;
  prefijo?: string;
  sufijo?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [mostrado, setMostrado] = useState(0);
  const [arrancado, setArrancado] = useState(false);
  const primera = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setArrancado(true);
          ob.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    if (!arrancado) return;
    if (!primera.current) {
      setMostrado(valor);
      return;
    }
    primera.current = false;
    let raf = 0;
    const t0 = performance.now();
    const duracion = 900;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / duracion);
      const e = 1 - Math.pow(1 - p, 3);
      setMostrado(valor * e);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [arrancado, valor]);

  return (
    <span ref={ref}>
      {prefijo}
      {mostrado.toFixed(decimales)}
      {sufijo}
    </span>
  );
}

/** Envoltorio que revela su contenido con un fundido al entrar en pantalla. */
export function Reveal({
  children,
  className = "",
  retraso = 0,
}: {
  children: ReactNode;
  className?: string;
  retraso?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          ob.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`academia-reveal${visible ? " academia-reveal-visible" : ""} ${className}`}
      style={{ transitionDelay: `${retraso}ms` }}
    >
      {children}
    </div>
  );
}
