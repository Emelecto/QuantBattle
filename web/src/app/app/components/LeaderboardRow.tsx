"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  country?: string | null;
  qp_earned: number;
  tournaments_won: number;
  sharpe_best?: number;
  tier?: string;
}

const rankBadge: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-gradient-to-br from-yellow-400 to-amber-500", text: "text-[#04110d]", label: "1" },
  2: { bg: "bg-gradient-to-br from-slate-300 to-slate-400", text: "text-[#04110d]", label: "2" },
  3: { bg: "bg-gradient-to-br from-amber-600 to-amber-700", text: "text-[#04110d]", label: "3" },
};

function FlagEmoji({ country }: { country?: string | null }) {
  if (!country) return null;
  const codePoints = country
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return <span className="text-[14px]" aria-label={country}>{String.fromCodePoint(...codePoints)}</span>;
}

export function LeaderboardRow({
  entry,
  highlight = false,
}: {
  entry: LeaderboardEntry;
  highlight?: boolean;
}) {
  const badge = rankBadge[entry.rank];

  return (
    <tr
      className={cn(
        "qb-row qb-glass-hover border-b border-line last:border-0 transition-colors",
        highlight && "bg-accent/[0.06]",
      )}
    >
      {/* Rank */}
      <td className="px-4 py-3">
        {badge ? (
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold",
              badge.bg,
              badge.text,
            )}
          >
            {badge.label}
          </span>
        ) : (
          <span className="metric text-[13px] text-muted pl-2">{entry.rank}</span>
        )}
      </td>

      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            {entry.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.avatar_url}
                alt={entry.username}
                className="h-8 w-8 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-solid metric text-[12px] text-muted">
                {(entry.username ?? "??").slice(0, 2).toUpperCase()}
              </span>
            )}
            {entry.tier && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border border-bg" />
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/app/profile/${entry.user_id}`}
              className="text-[13px] font-medium text-ink hover:text-accent transition-colors truncate block"
            >
              @{entry.username}
            </Link>
            <div className="flex items-center gap-1 mt-0.5">
              <FlagEmoji country={entry.country} />
              {entry.tier && (
                <span className="metric text-[10px] uppercase tracking-wider text-accent">
                  {entry.tier}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* QP Earned */}
      <td className="metric px-4 py-3 text-right text-[13px] font-medium text-accent">
        {entry.qp_earned.toLocaleString()}
      </td>

      {/* Tournaments Won */}
      <td className="metric px-4 py-3 text-right text-[13px] text-ink">
        {entry.tournaments_won}
      </td>

      {/* Best Sharpe */}
      <td className="metric px-4 py-3 text-right text-[13px] text-long">
        {entry.sharpe_best?.toFixed(2) ?? "—"}
      </td>
    </tr>
  );
}