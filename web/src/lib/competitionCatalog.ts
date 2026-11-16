import { listStockRounds } from "./stockTournaments";

// The catalog consumes cards, not a single tournament workspace. Additional
// modalities can supply this same shape without changing the page or its filters.
export type Competition = {
  id: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  deadline: string;
  status: "open" | "evaluating" | "finished";
  href: string;
};

export async function listCompetitions(offset = 0) {
  const data = await listStockRounds(offset);
  return {
    has_more: Boolean(data.has_more),
    entries: data.rounds.map((round): Competition => ({
      id: round.id,
      title: "Predicción diaria",
      date: round.target_date,
      description: "Predice cuánto cambiará el precio de cada acción entre la apertura y el cierre de la jornada.",
      tags: ["Datos de acciones", `${round.rows} acciones`],
      deadline: round.deadline,
      status: round.status === "settled" ? "finished" : round.status === "open" ? "open" : "evaluating",
      href: `/app/tournaments/${round.id}`,
    })),
  };
}

export function competitionState(entry: Competition, now: number) {
  return entry.status === "open" && Date.parse(entry.deadline) <= now ? "evaluating" : entry.status;
}
