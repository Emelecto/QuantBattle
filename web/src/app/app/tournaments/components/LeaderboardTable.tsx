"use client";

import { cn } from "@/lib/cn";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  isMe?: boolean;
  metric: number;
  returns?: number;
  trades?: number;
  submittedAt?: string;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  metricLabel: string;
  higherIsBetter?: boolean;
  className?: string;
}

export function LeaderboardTable({
  entries,
  metricLabel,
  higherIsBetter = true,
  className,
}: LeaderboardTableProps) {
  const badge = (rank: number) => {
    if (rank === 1) return "text-accent qb-glow-text";
    if (rank === 2) return "text-cyan";
    if (rank === 3) return "text-ink";
    return "text-muted";
  };

  return (
    <div className={cn("overflow-hidden rounded-lg qb-glass", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">Participante</th>
            <th className="px-4 py-2.5 font-medium text-right">{metricLabel}</th>
            <th className="px-4 py-2.5 font-medium text-right hidden sm:table-cell">
              Retornos
            </th>
            <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">
              Trades
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.rank}
              className={cn(
                "qb-row border-b border-line/40 last:border-0",
                entry.isMe && "bg-accent/5 ring-1 ring-inset ring-accent/20"
              )}
            >
              <td className={cn("px-4 py-3 metric font-semibold", badge(entry.rank))}>
                {entry.rank}
              </td>
              <td className="px-4 py-3">
                <span className={cn("text-ink", entry.isMe && "font-semibold")}>
                  {entry.username}
                </span>
                {entry.isMe && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                    (tú)
                  </span>
                )}
              </td>
              <td className="px-4 py-3 metric text-right text-ink">
                {higherIsBetter ? "+" : ""}
                {entry.metric.toFixed(2)}
              </td>
              <td className="px-4 py-3 metric text-right hidden sm:table-cell">
                <span className={cn((entry.returns ?? 0) >= 0 ? "text-long" : "text-short")}>
                  {(entry.returns ?? 0).toFixed(1)}%
                </span>
              </td>
              <td className="px-4 py-3 metric text-right text-muted hidden md:table-cell">
                {entry.trades ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-muted">
          Sin submissions todavía. ¡Sé el primero!
        </div>
      )}
    </div>
  );
}