import type { StockRound } from "@/lib/stockTournaments";

export const roundDate = (value: string) => new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium", timeZone: "America/New_York",
}).format(new Date(`${value}T12:00:00Z`));

export const submissionDate = (value: string) => new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
}).format(new Date(value));

export function roundState(round: StockRound, now = Date.now()) {
  if (round.status === "settled") return "finished";
  return round.status === "open" && Date.parse(round.deadline) > now ? "open" : "evaluating";
}

export function closingTime(deadline: string, now: number) {
  const minutes = Math.ceil((Date.parse(deadline) - now) / 60000);
  if (minutes <= 0) return "Plazo cerrado";
  if (minutes < 60) return `Cierra en ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Cierra en ${hours} h ${minutes % 60} min`;
  return `Cierra en ${Math.floor(hours / 24)} d ${hours % 24} h`;
}
