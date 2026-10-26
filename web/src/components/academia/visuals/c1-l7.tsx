'use client';

import { useEffect, useState } from 'react';

// L7 — Ficha hero del BTC: 4 métricas animadas + sparkline del cierre.
// OHLC real en web/content/cursos/fundamentos/data/c1_l7_btc.csv (90 sesiones, 2024-01-01 → 2024-03-30).

const CIERRES = [
  42000, 42243, 42722, 42640, 43299, 44013, 43675, 43574, 43350, 44064, 43929, 44528,
  43933, 43533, 42827, 43427, 43464, 43178, 42792, 42904, 42293, 41952, 42733, 42738,
  42688, 42842, 42061, 41831, 41082, 41945, 42549, 42328, 42026, 42072, 41630, 42289,
  41865, 41402, 41840, 41005, 41281, 41465, 40942, 41818, 41359, 41089, 42076, 41317,
  41057, 41122, 40922, 41086, 40278, 39815, 40000, 39766, 40097, 40795, 41548, 42222,
  41502, 41521, 40963, 41234, 40771, 41463, 41274, 41529, 41627, 42544, 42561, 43251,
  42953, 42434, 43394, 42850, 42511, 43412, 42596, 43304, 42687, 41983, 42244, 42283,
  42257, 42686, 41828, 42454, 42138, 42303,
];

const PRECIO_FINAL = 42303.45;
const RETORNO_TOTAL = 0.72;
const MAXIMO = 44527.75;
const VOL_DIARIA = 1.24;

function useCountUp(objetivo: number, duracion = 1200): number {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    let raf = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - inicio) / duracion);
      setValor(objetivo * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [objetivo, duracion]);
  return valor;
}

function sparkline(datos: number[], ancho = 600, alto = 120): string {
  const min = Math.min(...datos);
  const max = Math.max(...datos);
  return datos
    .map((v, i) => {
      const x = (i / (datos.length - 1)) * ancho;
      const y = alto - ((v - min) / (max - min)) * (alto - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const fmtUSD = (v: number, decimales = 2) =>
  v.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

export default function C1L7Visual() {
  const precio = useCountUp(PRECIO_FINAL);
  const retorno = useCountUp(RETORNO_TOTAL);
  const maximo = useCountUp(MAXIMO);
  const vol = useCountUp(VOL_DIARIA);
  const puntos = sparkline(CIERRES);

  const metricas = [
    { etiqueta: 'Cierre final', valor: fmtUSD(precio), nota: '30 mar 2024' },
    { etiqueta: 'Retorno total', valor: `+${retorno.toFixed(2)} %`, nota: '90 sesiones' },
    { etiqueta: 'Máximo del período', valor: fmtUSD(maximo, 0), nota: '12 ene 2024' },
    { etiqueta: 'Volatilidad diaria', valor: `${vol.toFixed(2)} %`, nota: 'desv. estándar' },
  ];

  return (
    <section className="academia-visual" aria-label="Visual: ficha del BTC">
      <h3 className="academia-section-title">BTC bajo la lupa · 90 sesiones</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        {metricas.map((m) => (
          <div
            key={m.etiqueta}
            className="academia-metric"
            style={{
              padding: '0.9rem',
              borderRadius: '0.75rem',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{m.valor}</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {m.etiqueta}
            </div>
            <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{m.nota}</div>
          </div>
        ))}
      </div>
      <svg
        viewBox="0 0 600 120"
        role="img"
        aria-label="Sparkline del precio de cierre del BTC"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <polyline
          points={puntos}
          fill="none"
          stroke="#a96b16"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p style={{ fontSize: '0.8rem', opacity: 0.75 }}>
        Del 1.º de enero ($42,000) al 30 de marzo de 2024 ($42,303.45): el camino importó más que
        la meta — cayó hasta $39,766 y tocó $44,528 en el trayecto.
      </p>
    </section>
  );
}
