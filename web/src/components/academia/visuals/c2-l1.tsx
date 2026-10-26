"use client";

/**
 * C2-L1 · Tu entorno cuant — checklist interactivo del setup (venv + pip)
 * + mini tabla OHLCV real (primeras filas de c2_l1.csv).
 */
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "./charts";
import { C2_ENTORNO_OHLCV } from "./lesson-data";

const PASOS = [
  { id: "py", titulo: "Verifica Python ≥ 3.10", cmd: "python --version" },
  { id: "venv", titulo: "Crea el entorno virtual", cmd: "python -m venv .venv" },
  { id: "act", titulo: "Activa el entorno", cmd: ".venv\\Scripts\\activate" },
  { id: "deps", titulo: "Instala pandas + numpy", cmd: "pip install pandas numpy matplotlib" },
  { id: "freeze", titulo: "Congela dependencias", cmd: "pip freeze > requirements.txt" },
  { id: "csv", titulo: "Lee tu primer CSV", cmd: 'python -c "import pandas as pd; print(pd.read_csv(\"data/c2_l1.csv\").head(3))"' },
];

export default function C2L1Visual() {
  const [hechos, setHechos] = useState<string[]>(["py"]);
  const [copiado, setCopiado] = useState<string | null>(null);
  const progreso = Math.round((hechos.length / PASOS.length) * 100);

  const resumen = useMemo(() => {
    const closes = C2_ENTORNO_OHLCV.map((v) => v.close);
    return {
      n: C2_ENTORNO_OHLCV.length,
      ultimo: closes[closes.length - 1],
      ret: (closes[closes.length - 1] / closes[0] - 1) * 100,
    };
  }, []);

  const alternar = (id: string) =>
    setHechos((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const copiar = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1200);
    } catch { /* portapapeles no disponible */ }
  };

  return (
    <div className="academia-viz">
      <Reveal>
        <p className="academia-viz-titulo">Checklist del entorno cuant</p>
        <p className="academia-viz-sub">
          Marca cada paso al completarlo. Un backtest solo es repetible si corre en un entorno aislado y versionado.
        </p>
      </Reveal>
      <Reveal retraso={120}>
        <div className="academia-control" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Progreso del setup</span>
            <span><CountUp valor={progreso} decimales={0} sufijo=" %" /></span>
          </div>
          <div className="academia-barra-fondo" aria-label={`Progreso ${progreso}%`}>
            <div className="academia-barra-relleno" style={{ width: `${progreso}%` }} />
          </div>
          {progreso === 100 && <p style={{ color: "#087951", fontSize: "0.9rem" }}>✓ Entorno listo: ya puedes reproducir cualquier lección del curso.</p>}
        </div>
      </Reveal>
      <Reveal retraso={200}>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {PASOS.map((p, i) => {
            const ok = hechos.includes(p.id);
            return (
              <li key={p.id} className={`academia-paso${ok ? " academia-paso-ok" : ""}`}>
                <label style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={ok} onChange={() => alternar(p.id)} aria-label={p.titulo} />
                  <span>
                    <strong>{i + 1}. {p.titulo}</strong>
                    <code className="academia-cmd">{p.cmd}</code>
                  </span>
                </label>
                <button type="button" className="academia-btn-mini" onClick={() => copiar(p.id, p.cmd)}>
                  {copiado === p.id ? "¡Copiado!" : "Copiar"}
                </button>
              </li>
            );
          })}
        </ol>
      </Reveal>
      <Reveal retraso={280}>
        <p className="academia-viz-graf-titulo">Tu dataset de trabajo · OHLCV BTC ({resumen.n} sesiones)</p>
        <div className="academia-stat-grid academia-stat-grid-3" style={{ marginBottom: "0.8rem" }}>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Sesiones</span><span className="academia-stat-valor"><CountUp valor={resumen.n} decimales={0} /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Último cierre</span><span className="academia-stat-valor"><CountUp valor={resumen.ultimo} decimales={0} prefijo="$" /></span></div>
          <div className="academia-stat"><span className="academia-stat-etiqueta">Retorno período</span><span className={`academia-stat-valor ${resumen.ret >= 0 ? "academia-positivo" : "academia-negativo"}`}><CountUp valor={resumen.ret} decimales={1} prefijo={resumen.ret >= 0 ? "+" : ""} sufijo=" %" /></span></div>
        </div>
        <div className="academia-tabla-scroll">
          <table className="academia-tabla">
            <thead><tr><th>Fecha</th><th>Apertura</th><th>Máx</th><th>Mín</th><th>Cierre</th><th>Vol</th></tr></thead>
            <tbody>
              {C2_ENTORNO_OHLCV.slice(0, 10).map((v) => (
                <tr key={v.fecha}>
                  <td>{v.fecha}</td><td>{v.open.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</td>
                  <td>{v.high.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</td>
                  <td>{v.low.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</td>
                  <td><strong>{v.close.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</strong></td>
                  <td>{v.volume.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="academia-viz-nota">Primeras 10 de {resumen.n} filas · fechas 32–40 del CSV vienen corridas y se tratan como etiquetas.</p>
      </Reveal>
    </div>
  );
}
