"use client";

import { cn } from "@/lib/cn";

export interface StrategyTemplate {
  id: string;
  label: string;
  description: string;
  /** Código compacto que entiende el motor (formato fast=XX,slow=YY). */
  code: string;
}

/** Plantillas one-click de estrategias reales. El motor ignora lo que no entienda. */
const TEMPLATES: StrategyTemplate[] = [
  {
    id: "sma-classic",
    label: "SMA cruzadas clásicas",
    description: "Cruce de medias móviles 20/50 para captar tendencias limpias.",
    code: "fast=20,slow=50",
  },
  {
    id: "momentum-14d",
    label: "Momentum 14d",
    description: "Velocidad de precio en ventanas cortas para tendencias fuertes.",
    code: "fast=10,slow=30",
  },
  {
    id: "mean-reversion-rsi",
    label: "Mean reversion RSI",
    description: "Reversión a la media usando RSI de 14 periodos.",
    code: "fast=14,slow=50",
  },
  {
    id: "breakout-volume",
    label: "Breakout volumen",
    description: "Quiebre de rango confirmado por volumen para entradas decididas.",
    code: "fast=20,slow=50",
  },
];

/**
 * Grid de plantillas reutilizable. No maneja estado global: al pulsar "Usar"
 * llama onSelect(code, label) y deja que el orquestador aplique la estrategia.
 */
export function StrategyTemplates({
  onSelect,
}: {
  onSelect: (code: string, label: string) => void;
}) {
  return (
    <section
      aria-label="Plantillas de estrategia"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-tight text-ink">
          Plantillas listas
        </h2>
        <p className="text-xs text-muted">
          Empieza con una estrategia real en un clic.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEMPLATES.map((tpl) => (
          <article
            key={tpl.id}
            className={cn("qb-glass qb-elev-1 flex flex-col gap-3 rounded-xl p-4")}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-semibold text-ink">{tpl.label}</h3>
              <p className="text-xs leading-relaxed text-muted">
                {tpl.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelect(tpl.code, tpl.label)}
              aria-label={`Usar plantilla ${tpl.label}`}
              className={cn(
                "qb-btn-secondary mt-auto inline-flex h-9 items-center justify-center rounded-md px-3 text-[13px] font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              )}
            >
              Usar
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
