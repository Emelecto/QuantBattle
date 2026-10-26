"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { experimentHistory, type ExperimentPage, type MlExperiment } from "@/lib/mlTournaments";
import type { DashboardTournament } from "@/components/dashboard/useDashboardData";
import { PilotEvidencePanel } from "./PilotEvidencePanel";
import "./ml-workspace.css";
import "./ml-workspace-light.css";

const date = (value: string) => new Intl.DateTimeFormat("es-CO", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"}).format(new Date(value));
const score = (value: number | null) => value == null ? "Pendiente de cierre y evaluación" : value.toFixed(6);

export function MlWorkspace({nextRound, roundsLoading, roundsError}: {nextRound?: DashboardTournament; roundsLoading: boolean; roundsError: boolean}) {
  const {user} = useAuth();
  const [page, setPage] = useState<ExperimentPage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [snapshot, setSnapshot] = useState<string | undefined>();
  const [retry, setRetry] = useState(0);
  const [expandedHistory, setExpandedHistory] = useState(false);
  useEffect(() => {
    const refresh = () => {setOffset(0);setSnapshot(undefined);setRetry(value=>value+1);};
    window.addEventListener("quantlab:ml-submitted",refresh);
    return () => window.removeEventListener("quantlab:ml-submitted",refresh);
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(true); setError(false); } });
    experimentHistory(offset, snapshot).then(value=>{if(active)setPage(value);})
      .catch(()=>{if(active)setError(true);})
      .finally(()=>{if(active)setLoading(false);});
    return () => {active=false;};
  }, [user, offset, snapshot, retry]);
  function exportPage() {
    if (!page) return;
    const blob = new Blob([JSON.stringify({exported_at:new Date().toISOString(),scope:"Página de experimentos propios; métricas comparables solo dentro de su ronda",...page},null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href=url; anchor.download=`quantlab-experimentos-${offset}.json`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const selected = page?.entries.find(entry=>entry.is_selected && entry.dataset_id === nextRound?.datasetId);
  const submissionStatus = nextRound?.submission?.status;
  const evaluated = submissionStatus === "scored" || submissionStatus === "done";
  const validated = submissionStatus === "validated" || evaluated;
  return <section id="historial-ml" aria-labelledby="workspace-heading" className="ql-research-workspace">
    <div className="ql-ml-hero">
      <div className="ql-ml-hero-main">
        <div className="ql-ml-hero-topline">
          <span className="ql-ml-eyebrow">ESTACIÓN DE INVESTIGACIÓN / ML</span>
          <span className={`ql-ml-live${roundsError ? " is-error" : ""}`}><span aria-hidden="true" />{roundsLoading ? "Consultando ronda" : roundsError ? "Consulta no disponible" : nextRound ? "Ronda disponible" : "Sin ronda abierta"}</span>
        </div>
        <h2 id="workspace-heading">{nextRound ? "Tu próxima ronda empieza con los datos." : "Explora tu próxima ronda de investigación."}</h2>
        <p className="ql-ml-hero-intro">{roundsLoading ? "Consultando las rondas disponibles…" : roundsError ? "No se pudieron consultar las rondas ahora. Puedes intentar abrir la lista de torneos." : nextRound ? "Descarga el dataset, prepara tus predicciones y comprueba el estado de tu envío." : "Consulta las competencias para encontrar la próxima ronda disponible."}</p>
        <div className="ql-ml-round">
          <span className="ql-ml-field-label">{nextRound ? "RONDA DISPONIBLE" : "TORNEOS ML"}</span>
          {nextRound ? <>
            <Link href={`/app/tournaments/${nextRound.id}`} className="ql-ml-round-name">{nextRound.name}<span aria-hidden="true">↗</span></Link>
            <div className="ql-ml-round-meta"><span>Cierre · {nextRound.deadline ? date(nextRound.deadline) : "Por anunciar"}</span><span>Dataset · {nextRound.datasetVersion}</span></div>
          </> : <p className="ql-ml-round-none">{roundsLoading ? "Cargando…" : roundsError ? "Estado de las rondas no disponible." : "No se encontró una ronda abierta."}</p>}
        </div>
        <div className="ql-ml-hero-actions">
          <Link href={nextRound ? `/app/tournaments/${nextRound.id}` : "/app/tournaments"} className="ql-btn-primary ql-ml-main-action">{nextRound ? nextRound.submission ? "Revisar mi envío" : "Preparar mis predicciones" : "Explorar torneos"}<span aria-hidden="true">↗</span></Link>
          <Link href="/app/tournaments/guide" className="ql-ml-guide-link">Cómo funciona una ronda <span aria-hidden="true">→</span></Link>
        </div>
      </div>
      <aside className="ql-ml-hero-status" aria-label="Estado de tu investigación">
        <div className="ql-ml-status-heading"><span className="ql-ml-field-label">ESTADO DEL ENVÍO</span><span className="ql-ml-status-mark" aria-hidden="true">↗</span></div>
        <p className="ql-ml-status-title">{loading ? "Consultando…" : error ? "Estado no disponible" : roundsError ? "Rondas no disponibles" : !nextRound ? "Sin ronda abierta" : evaluated ? "Resultado disponible" : validated ? "Predicción validada" : nextRound.submission ? "Predicción registrada" : "Lista para empezar"}</p>
        <p className="ql-ml-status-copy">{loading ? "Consultando tus envíos…" : error ? "No se pudo consultar el estado." : roundsError ? "No podemos confirmar si hay una ronda abierta. Intenta actualizar el dashboard." : !nextRound ? "Consulta los torneos y tu historial mientras se prepara la próxima ronda." : selected ? `${selected.row_count.toLocaleString("es-CO")} filas · ${selected.experiment?.model_name ?? "Envío sin ficha de modelo"}` : nextRound.submission ? "Hay un envío seleccionado. Abre la ronda para consultar su comprobante." : "Descarga el dataset de la ronda y envía tus predicciones para iniciar tu registro."}</p>
        {selected && <p className="ql-ml-status-score">Spearman: {score(selected.score)}</p>}
        <div className="ql-ml-process" aria-label="Etapas del torneo">
          <div className={nextRound ? "is-current" : ""}><span>01</span><strong>Datos</strong><small>{nextRound ? "Disponibles" : "Pendientes"}</small></div>
          <div className={nextRound?.submission ? "is-current" : ""}><span>02</span><strong>Predicción</strong><small>{validated ? "Validada" : nextRound?.submission ? "Enviada" : "Por enviar"}</small></div>
          <div className={evaluated ? "is-current" : ""}><span>03</span><strong>Evaluación</strong><small>{evaluated ? "Publicada" : "Pendiente"}</small></div>
        </div>
      </aside>
    </div>
    <PilotEvidencePanel />
    <div className="ql-ml-history">
    <div className="ql-ml-history-heading">
      <div><span className="ql-ml-field-label">BITÁCORA / EXPERIMENTOS</span><h3>Historial de experimentos</h3></div>
      <p>Fechas en hora de Colombia. Cada resultado pertenece a una versión y una ronda; no se suman scores de datasets diferentes.</p>
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted">{!loading && !error && page ? `${page.entries.length} envíos en esta página` : "Registro de envíos"}</span>
      <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" className="text-accent underline disabled:opacity-50" disabled={loading} onClick={()=>{setOffset(0);setSnapshot(undefined);setRetry(value=>value+1);}}>Actualizar historial</button>
        <button type="button" className="text-accent underline disabled:opacity-50" disabled={loading || error || !page?.entries.length} onClick={exportPage}>Descargar esta página (JSON)</button>
      </div>
    </div>
    {loading ? <p role="status" className="mt-4 text-sm text-muted">Cargando experimentos…</p> : error ? <div role="alert" className="mt-4 text-sm text-short">No se pudo cargar el historial. <button className="underline" onClick={()=>setRetry(value=>value+1)}>Reintentar historial</button></div> : !page?.entries.length ? <p className="mt-4 text-sm text-muted">Todavía no hay envíos guardados. Descarga los datos de una ronda y registra tu primer experimento.</p> : <>
      <ol className="mt-4 divide-y divide-line">{(expandedHistory || offset > 0 ? page.entries : page.entries.slice(0,3)).map(entry=><ExperimentRow key={entry.id} entry={entry} />)}</ol>
      {offset === 0 && page.entries.length > 3 && <button type="button" aria-expanded={expandedHistory} className="mt-3 min-h-11 text-sm text-accent underline underline-offset-4" onClick={()=>setExpandedHistory(value=>!value)}>{expandedHistory ? "Mostrar solo los tres más recientes" : `Ver los ${page.entries.length} experimentos de esta página`}</button>}
      <nav aria-label="Páginas del historial" className="mt-5 flex flex-wrap justify-between gap-4 text-sm">
        <button className="text-accent underline disabled:opacity-40" disabled={!offset || loading} onClick={()=>setOffset(value=>Math.max(0,value-10))}>Más recientes</button>
        <span className="text-muted">Página: envíos {offset+1}–{offset+page.entries.length}{!expandedHistory && offset === 0 && page.entries.length > 3 ? " · vista resumida" : ""}</span>
        <button className="text-accent underline disabled:opacity-40" disabled={!page.has_more || loading} onClick={()=>{setSnapshot(page.snapshot);setOffset(page.next_offset ?? offset);}}>Más antiguos</button>
      </nav>
    </>}
    </div>
  </section>;
}

function ExperimentRow({entry}: {entry: MlExperiment}) {
  return <li className="py-4">
    <details>
      <summary className="cursor-pointer text-base text-ink">
        <span className="break-words font-medium">{entry.experiment?.model_name ?? (entry.metadata_status === "unavailable" ? "Ficha temporalmente no disponible" : "Envío anterior sin ficha")}</span>
        <span className="mt-1 block text-sm text-muted">{entry.round.name} · ronda {entry.round.round_number} · {date(entry.submitted_at)} · {entry.is_selected ? "Seleccionado" : "No seleccionado"}</span>
      </summary>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Score de esta ronda</dt><dd className="mt-1 text-ink">{entry.round.status === "scored" ? score(entry.score) : "Oculto hasta el cierre y la evaluación"}</dd></div>
        <div><dt className="text-muted">Versión del dataset</dt><dd className="mt-1 break-all font-mono text-ink">{entry.dataset_version ?? "Sin versión registrada"}</dd></div>
        <div><dt className="text-muted">Semilla declarada</dt><dd className="mt-1 text-ink">{entry.experiment?.seed ?? "No informada"}</dd></div>
        <div><dt className="text-muted">SHA-256 del CSV</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{entry.file_sha256 ?? "No registrado"}</dd></div>
      </dl>
      {entry.experiment && <><p className="mt-4 text-sm text-muted">Parámetros declarados</p><pre className="mt-2 max-h-52 overflow-auto rounded-md bg-bg p-3 text-sm text-ink">{JSON.stringify(entry.experiment.parameters,null,2)}</pre>{entry.experiment.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink">{entry.experiment.note}</p>}</>}
      {entry.round.benchmarks && <p className="mt-4 text-sm text-muted">Referencias de esta misma ronda: azar {entry.round.benchmarks.random?.toFixed(6) ?? "—"}; primera variable {entry.round.benchmarks.feature_01?.toFixed(6) ?? "—"}. Spearman no mide rentabilidad.</p>}
      <Link href={`/app/tournaments/${entry.round.tournament_id}`} className="mt-4 inline-block text-sm text-accent underline">Abrir ronda y comprobante</Link>
    </details>
  </li>;
}
