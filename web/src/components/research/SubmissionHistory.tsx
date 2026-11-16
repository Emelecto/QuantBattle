"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listStockSubmissions, type StockHistoryEntry, type SubmissionFilter } from "@/lib/stockTournaments";
import { roundDate, submissionDate } from "./competition-utils";
import { Icon } from "@/components/dashboard/Sidebar";
import "./competitions.css";

const filters: [SubmissionFilter, string][] = [["all", "Todos"], ["pending", "En evaluación"], ["evaluated", "Evaluados"], ["previous", "Anteriores"]];

export function SubmissionHistory() {
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [filter, setFilter] = useState<SubmissionFilter>("all");
  const [days, setDays] = useState(0);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setRetry((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    listStockSubmissions(offset, filter, days).then((data) => {
      if (!active) return;
      setEntries(data.entries);
      setMore(data.has_more);
      setError("");
    }).catch(() => {
      if (active) setError("No pudimos cargar tus envíos. Vuelve a intentarlo para consultar tu historial.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset, filter, days, retry]);

  function changeFilter(value: SubmissionFilter) {
    if (value === filter && offset === 0) return;
    setLoading(true); setError(""); setExpanded(""); setOffset(0); setFilter(value);
  }
  const evaluated = entries.filter((e) => e.is_selected && e.round_status === "settled" && typeof e.score === "number").length;
  const pending = entries.filter((e) => e.round_status !== "settled" && e.is_selected).length;

  return <div className="qb-page competition-page">
    <header className="competition-heading"><h1>Mis envíos</h1><p>Consulta tus archivos, revisa su estado y encuentra los resultados de cada ronda.</p></header>
    <section aria-label="Resumen de los envíos de esta página">
      <p className="submission-summary-caption">Resumen de esta página</p>
      <div className="submission-summary" aria-busy={loading}>
        {[["strategies", entries.length, "envíos registrados"], ["clock", pending, "por evaluar"], ["check", evaluated, "evaluados"]].map(([icon, count, label]) => <div key={label}><span className="competition-icon"><Icon name={String(icon)} size={25} /></span><div><strong>{loading || error ? "—" : count}</strong><span>{label}</span></div></div>)}
      </div>
    </section>
    <div className="competition-toolbar">
      <div className="competition-filters" role="group" aria-label="Filtrar envíos">{filters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}</button>)}</div>
      <label className="submission-date-filter" htmlFor="submission-date"><span id="submission-date-label">Fecha de envío</span><select id="submission-date" aria-labelledby="submission-date-label" value={days} onChange={(event) => { setLoading(true); setError(""); setOffset(0); setDays(Number(event.target.value)); }}><option value={0}>Todas las fechas</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label>
    </div>
    <p className="submission-notice"><Icon name="info" size={20} /><span>El último archivo válido enviado antes del cierre es el que participa. Los anteriores se conservan en tu historial.</span></p>
    {error ? <div role="alert" className="competition-error">{error} <button onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>Reintentar</button></div> : loading ? <p role="status" className="competition-empty">Consultando tus envíos…</p> : !entries.length ? <div className="competition-empty"><h2>{filter !== "all" || days ? "No hay envíos con estos filtros" : "Tu primer envío empieza en un torneo"}</h2><p>{filter !== "all" || days ? "Prueba con otro estado o amplía el rango de fechas." : "Cuando envíes tus predicciones, aquí podrás consultar el comprobante y seguir su evaluación."}</p><Link href="/app/tournaments">Explorar torneos</Link></div> : <div className="submission-records">
      <div className="submission-column-head" aria-hidden="true"><span>Torneo y ronda</span><span>Fecha de envío</span><span>Estado</span><span>Resultado</span><span>Detalle</span></div>
      {entries.map((entry) => {
        const isEvaluated = entry.round_status === "settled";
        const hasScore = isEvaluated && typeof entry.score === "number" && Number.isFinite(entry.score);
        const state = !entry.is_selected ? "previous" : hasScore ? "finished" : "evaluating";
        return <article key={entry.id} className="submission-record" aria-label={`Envío ${entry.id}`}>
          <div className="submission-record-main">
            <div><Link className="submission-round-link" href={`/app/tournaments/${entry.round.id}`}>Predicción diaria · {roundDate(entry.round.target_date)}</Link><p className="submission-file"><Icon name="strategies" size={15} /> CSV · {entry.row_count} predicciones</p><span className={`submission-selection ${entry.is_selected ? "selected" : ""}`}>{entry.is_selected ? "Envío que participa" : "Intento anterior"}</span></div>
            <div><span className="submission-mobile-label">Fecha de envío</span><time dateTime={entry.submitted_at}>{submissionDate(entry.submitted_at)}</time></div>
            <div><span className="submission-mobile-label">Estado</span><span className={`competition-status ${state}`}>{!entry.is_selected ? "Anterior" : hasScore ? "Evaluado" : "En evaluación"}</span></div>
            <div className="submission-result"><span className="submission-mobile-label">Puntuación</span><span>{hasScore ? entry.score!.toFixed(4) : entry.is_selected && !isEvaluated ? "Pendiente" : "—"}</span></div>
            <button className="submission-detail-button" aria-expanded={expanded === entry.id} aria-controls={`receipt-${entry.id}`} onClick={() => setExpanded(expanded === entry.id ? "" : entry.id)}>{expanded === entry.id ? "Ocultar" : "Ver detalle"}<Icon name="arrow-right" size={15} /></button>
          </div>
          {expanded === entry.id && <div className="submission-detail" id={`receipt-${entry.id}`}><h2>Comprobante de tu envío</h2><dl><div><dt>Identificador</dt><dd>{entry.id}</dd></div><div><dt>Huella del archivo (SHA-256)</dt><dd>{entry.file_sha256}</dd></div>{hasScore && <div><dt>Error medio de la predicción</dt><dd>{entry.mae == null ? "No disponible" : entry.mae.toFixed(6)}</dd></div>}</dl><p>{entry.is_selected ? "Este es el archivo elegido para esta ronda." : "Este intento fue reemplazado por un envío válido posterior."} {hasScore ? "Una puntuación mayor indica menos error frente a predecir cero. Solo compara puntuaciones de la misma ronda." : isEvaluated ? "Este intento no tiene una puntuación publicada." : "La puntuación aparece cuando termina la evaluación."}</p><Link href={`/app/tournaments/${entry.round.id}`}>Abrir la ronda</Link></div>}
        </article>;
      })}
    </div>}
    {!error && <nav className="competition-pagination" aria-label="Páginas del historial"><button disabled={loading || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - 20)); }}>Anterior</button><span>Página {Math.floor(offset / 20) + 1}</span><button disabled={loading || !more} onClick={() => { setLoading(true); setOffset(offset + 20); }}>Siguiente</button></nav>}
  </div>;
}
