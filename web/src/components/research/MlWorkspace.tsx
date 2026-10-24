"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { experimentHistory, type ExperimentPage, type MlExperiment } from "@/lib/mlTournaments";
import type { DashboardTournament } from "@/components/dashboard/useDashboardData";

const date = (value: string) => new Intl.DateTimeFormat("es-CO", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"}).format(new Date(value));
const score = (value: number | null) => value == null ? "Pendiente de cierre y evaluación" : value.toFixed(6);

export function MlWorkspace({nextRound, roundsLoading}: {nextRound?: DashboardTournament; roundsLoading: boolean}) {
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
    setLoading(true); setError(false);
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
  return <section id="historial-ml" aria-labelledby="workspace-heading" className="ql-research-workspace mb-6 rounded-xl border border-line p-5 sm:p-6">
    <h2 id="workspace-heading" className="text-xl font-semibold text-ink">Mi investigación ML</h2>
    <p className="mt-2 text-sm text-muted">Fechas en hora de Colombia. Cada resultado pertenece a una versión y una ronda; no se suman scores de datasets diferentes.</p>
    <div className="mt-5 grid gap-6 border-y border-line py-5 sm:grid-cols-2">
      <div><h3 className="font-medium text-ink">Próximo cierre</h3>
        {roundsLoading ? <p className="mt-2 text-sm text-muted">Consultando rondas…</p> : nextRound ? <>
          <Link href={`/app/tournaments/${nextRound.id}`} className="mt-2 block text-accent underline">{nextRound.name}</Link>
          <p className="mt-2 text-base text-ink">{nextRound.deadline ? date(nextRound.deadline) : "Por anunciar"}</p>
          <p className="mt-2 break-all font-mono text-xs text-muted">{nextRound.datasetVersion}</p>
          <Link href={`/app/tournaments/${nextRound.id}`} className="ql-btn-primary mt-5 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium">{nextRound.submission ? "Revisar mi envío" : "Preparar mis predicciones"}</Link>
        </> : <p className="mt-2 text-sm text-muted">No se encontró una ronda abierta. Consulta Torneos para revisar su disponibilidad.</p>}
      </div>
      <div><h3 className="font-medium text-ink">Envío seleccionado para esta ronda</h3>
        <p className="mt-2 text-sm text-muted">{loading ? "Consultando tus envíos…" : error ? "No se pudo consultar el estado." : selected ? `${selected.row_count.toLocaleString("es-CO")} filas · ${selected.experiment?.model_name ?? "Envío sin ficha de modelo"}` : nextRound?.submission ? "Hay un envío seleccionado. Abre la ronda para consultar su comprobante." : "No aparece un envío seleccionado en esta página del historial. Puedes comprobarlo en la ronda."}</p>
        {selected && <p className="mt-2 text-sm text-ink">{score(selected.score)}</p>}
      </div>
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-ink">Historial de experimentos</h3>
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
