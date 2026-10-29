import type { ReactNode } from "react";

export type AchievementId = "primera" | "sharpe" | "btc";

const ICONS: Record<AchievementId, ReactNode> = {
  // Bandera: primera estrategia creada.
  primera: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 3v18" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  ),
  // Escudo con check: Sharpe sólido (desinflado OOS).
  sharpe: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  // Trofeo: superó a BTC buy & hold.
  btc: (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
      <path d="M5 4H3v2a3 3 0 0 0 3 3" />
      <path d="M19 4h2v2a3 3 0 0 1-3 3" />
      <path d="M9 14h6l-1 6H10z" />
    </svg>
  ),
};

export const ACHIEVEMENTS: Record<AchievementId, { label: string }> = {
  primera: { label: "Primera estrategia" },
  sharpe: { label: "Sharpe sólido" },
  btc: { label: "Superó a BTC" },
};

/** Chip de logro: .qb-glass con icono SVG inline. */
export function AchievementBadge({
  id,
  label,
}: {
  id: AchievementId;
  label: string;
}) {
  return (
    <span
      className="qb-glass inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink"
      title={label}
    >
      <span aria-hidden className="text-accent">
        {ICONS[id]}
      </span>
      {label}
    </span>
  );
}
