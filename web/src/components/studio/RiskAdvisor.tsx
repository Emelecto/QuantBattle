"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface RiskParams {
  commission: number;
  slippage?: number;
}

type ProfileId = "conservador" | "equilibrado" | "agresivo";

interface RiskProfile {
  id: ProfileId;
  label: string;
  commission: number;
  slippage: number;
  hint: string;
}

/** Perfiles de riesgo con params sensatos sugeridos al motor. */
const PROFILES: RiskProfile[] = [
  {
    id: "conservador",
    label: "Conservador",
    commission: 0.05,
    slippage: 0.0002,
    hint: "Menos costos, señales más filtradas.",
  },
  {
    id: "equilibrado",
    label: "Equilibrado",
    commission: 0.1,
    slippage: 0.0005,
    hint: "Balance entre costo y oportunidades de trading.",
  },
  {
    id: "agresivo",
    label: "Agresivo",
    commission: 0.25,
    slippage: 0.001,
    hint: "Más operaciones, asumiendo mayor fricción de mercado.",
  },
];

/**
 * Asistente de riesgo: elige un perfil y propaga comisión/slippage vía onApply.
 * Mantiene su propio estado de selección (UI local), no global.
 */
export function RiskAdvisor({
  onApply,
}: {
  onApply: (params: RiskParams) => void;
}) {
  const [selected, setSelected] = useState<ProfileId | null>(null);

  function choose(p: RiskProfile) {
    setSelected(p.id);
    onApply({ commission: p.commission, slippage: p.slippage });
  }

  return (
    <section
      aria-label="Asistente de riesgo"
      className="qb-glass qb-elev-1 rounded-xl p-4"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          Perfil de riesgo
        </h3>
        <p className="text-xs text-muted">
          Elige un perfil y ajustamos la comisión y el slippage.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Perfil de riesgo"
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {PROFILES.map((p) => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(p)}
              className={cn(
                active ? "qb-btn-primary" : "qb-btn-secondary",
                "flex h-auto flex-col items-start gap-1 rounded-md px-3 py-3 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              )}
            >
              <span className="text-[13px] font-semibold">{p.label}</span>
              <span className="text-[11px] leading-snug opacity-80">
                {p.hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
