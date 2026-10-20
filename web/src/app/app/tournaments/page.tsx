"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listTournaments, type Tournament } from "@/lib/tournaments";
import { listDatasets, type MlDataset } from "@/lib/mlTournaments";
import { TournamentCard } from "./components/TournamentCard";

export default function TournamentsPage() {
  const [rounds, setRounds] = useState<{ tournament: Tournament; dataset: MlDataset }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tournaments, datasets] = await Promise.all([listTournaments({ type: "ml" }), listDatasets()]);
      const latest = new Map<string, MlDataset>();
      for (const dataset of datasets) {
        if (dataset.kind !== "live" || dataset.score_version !== "spearman_era_v1") continue;
        const previous = latest.get(dataset.tournament_id);
        if (!previous || dataset.round_number > previous.round_number) latest.set(dataset.tournament_id, dataset);
      }
      setRounds(tournaments.flatMap((tournament) => {
        const dataset = latest.get(tournament.id);
        return dataset ? [{ tournament, dataset }] : [];
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las rondas. Vuelve a intentar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Torneos de machine learning</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">Descarga los datos, entrena tu modelo y envía predicciones. La práctica usa mercados artificiales, es gratuita y no otorga premios QP.</p>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <Link href="/app/tournaments/guide" className="text-accent underline underline-offset-4">Cómo participar</Link>
        <Link href="/docs#evaluacion" className="text-accent underline underline-offset-4">Evidencia técnica del semillero</Link>
      </div>
      {error ? (
        <div role="alert" className="mt-8 rounded-xl border border-line p-6">
          <p className="text-sm text-short">{error}</p>
          <button onClick={() => void load()} className="mt-4 rounded-md border border-line px-4 py-2 text-sm text-ink">Volver a cargar</button>
        </div>
      ) : loading ? (
        <p role="status" className="mt-8 text-sm text-muted">Cargando rondas publicadas… El servidor puede tardar al iniciar.</p>
      ) : rounds.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line p-6 text-muted">Todavía no hay rondas publicadas bajo el protocolo actual. Consulta la guía o vuelve más tarde.</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {rounds.map(({ tournament, dataset }) => (
            <TournamentCard key={tournament.id} tournament={{
              id: tournament.id, name: tournament.name, type: "ml",
              status: dataset.status === "ready" && !!dataset.closes_at && Date.parse(dataset.closes_at) > Date.now() ? "active" : "finished",
              asset_type: dataset.mode === "sintetico" ? "synthetic" : "crypto",
              qp_prize: 0, deadline: dataset.closes_at ?? tournament.submission_deadline,
              participants: tournament.submission_count,
              metric_label: "Spearman medio por era",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
