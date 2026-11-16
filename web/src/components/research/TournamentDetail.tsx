"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStockRound, type StockRound } from "@/lib/stockTournaments";
import { RoundFiles, RoundSubmission } from "./StockRounds";
import { roundDate, roundState, submissionDate } from "./competition-utils";
import "./competitions.css";

export function TournamentDetail({ id }: { id: string }) {
  const [round, setRound] = useState<StockRound | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let active = true;
    const load = () => getStockRound(id).then((data) => { if (active) { setRound(data.round); setError(""); } }).catch(() => { if (active) setError("No pudimos consultar esta ronda. Reintenta o vuelve a la lista de torneos."); });
    void load();
    const timer = setInterval(() => { setNow(Date.now()); void load(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [id, retry]);
  const state = round ? roundState(round, now) : null;
  return <div className="qb-page competition-page">
    <Link className="competition-back" href="/app/tournaments">← Todos los torneos</Link>
    <header className="competition-heading"><h1>Predicción diaria</h1><p>{round ? `Ronda del ${roundDate(round.target_date)} · ${round.rows} acciones` : "Consultando la ronda…"}</p></header>
    {error && <div className="competition-error" role="alert">{error} <button onClick={() => setRetry((n) => n + 1)}>Reintentar</button></div>}
    {round && !error && <section className="competition-workspace" aria-label="Datos y envío de la ronda">
      <div className="competition-workspace-heading"><h2>{state === "open" ? "Prepara y envía tus predicciones" : state === "finished" ? "Ronda evaluada" : "Esperando los resultados"}</h2><span className={`competition-status ${state}`}>{state === "open" ? "Abierto" : state === "finished" ? "Finalizado" : "En evaluación"}</span></div>
      <p>Predice cuánto cambiará cada acción entre la apertura y el cierre de la jornada. Información disponible hasta el {roundDate(round.observation_date)}.</p><p className="competition-deadline">Cierre de envíos: {submissionDate(round.deadline)} · Colombia</p>
      <div className="competition-help"><Link href="/app/tournaments/guide">Cómo preparar el archivo</Link><Link href="/app/library">Datos para entrenar tu modelo</Link><Link href="/app/submissions">Ver todos mis envíos</Link></div>
      <h3 className="competition-files-title">1. Descarga los datos de esta ronda</h3><RoundFiles round={round} />
      <h3 className="competition-files-title">2. {state === "open" ? "Sube tu archivo de predicciones" : "Revisa tus envíos y resultados"}</h3><RoundSubmission round={round} open={state === "open"} />
    </section>}
  </div>;
}
