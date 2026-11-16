"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listCompetitions, competitionState, type Competition } from "@/lib/competitionCatalog";
import { closingTime, roundDate, submissionDate } from "./competition-utils";
import { Icon } from "@/components/dashboard/Sidebar";
import "./competitions.css";

const filters = [
  ["all", "Todos"], ["open", "Abiertos"], ["evaluating", "En evaluación"], ["finished", "Finalizados"],
] as const;

export function TournamentCatalog() {
  const [rounds, setRounds] = useState<Competition[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    const load = () => listCompetitions(offset).then((data) => {
      if (!active) return;
      setRounds((previous) => [...new Map([...previous, ...data.entries].map((r) => [r.id, r])).values()].sort((a, b) => b.date.localeCompare(a.date)));
      setMore(Boolean(data.has_more));
      setError("");
    }).catch(() => {
      if (active) setError("No pudimos cargar los torneos. Vuelve a intentarlo.");
    }).finally(() => { if (active) setLoading(false); });
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [offset, retry]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const counts = Object.fromEntries(filters.slice(1).map(([key]) => [key, rounds.filter((r) => competitionState(r, now) === key).length]));
  const visible = rounds.filter((r) => filter === "all" || competitionState(r, now) === filter);

  return (
    <div className="qb-page competition-page">
      <header className="competition-heading">
        <h1>Torneos</h1>
        <p>Elige un reto, revisa el plazo y participa con tu modelo.</p>
        <div className="competition-help"><Link href="/app/learn/first-tournament">Tu primer torneo, paso a paso</Link><Link href="/app/library">Datos para preparar tu modelo</Link></div>
      </header>
      <div className="competition-toolbar">
        <div className="competition-filters" role="group" aria-label="Filtrar torneos">
          {filters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {!loading && !error && <p className="competition-counts">{counts.open} abiertos <span>·</span> {counts.evaluating} en evaluación <span>·</span> {counts.finished} finalizados{more && <small>En los torneos cargados</small>}</p>}
      </div>
      {error && <div className="competition-error" role="alert">{error} <button onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>Reintentar</button></div>}
      {loading && !rounds.length ? <p className="competition-empty" role="status">Consultando torneos disponibles…</p> : !error && !visible.length ? <div className="competition-empty"><h2>{rounds.length ? "No hay torneos en este estado" : "Aún no hay torneos publicados"}</h2><p>{rounds.length ? "Elige otro filtro para consultar los demás torneos." : "Puedes preparar tu modelo con los datos históricos mientras se publica el próximo reto."}</p><Link href="/app/library">Explorar los datos</Link></div> : null}
      <div className="competition-grid" id="rondas-diarias">
        {visible.map((round) => {
          const state = competitionState(round, now);
          return <article className="competition-card" key={round.id}>
            <header><span className="competition-icon"><Icon name="trophy" size={26} /></span><div><h2>{round.title}</h2><p>Ronda del {roundDate(round.date)}</p></div><span className={`competition-status ${state}`}>{state === "open" ? "Abierto" : state === "finished" ? "Finalizado" : "En evaluación"}</span></header>
            <p className="competition-description">{round.description}</p>
            <div className="competition-tags">{round.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <footer><div><strong>{state === "open" ? closingTime(round.deadline, now) : state === "finished" ? "Resultados disponibles" : "Envíos cerrados"}</strong><span>Cierre: {submissionDate(round.deadline)} · COL</span></div><Link className="competition-primary" href={round.href}>Ver torneo <Icon name="arrow-right" size={16} /></Link></footer>
          </article>;
        })}
      </div>
      {more && <div className="competition-pagination"><p>{rounds.length} torneos cargados</p><button disabled={loading || Boolean(error)} onClick={() => { setLoading(true); setOffset(rounds.length); }}>{loading ? "Cargando…" : "Cargar más torneos"}</button></div>}
    </div>
  );
}
