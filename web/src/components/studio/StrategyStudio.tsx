"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Contenedor con tabs "Asistente visual" | "Código pro".
 * El primer tab deja un hueco para los bloques UX (visual / children); el
 * segundo para el editor de código. No importa nada que otro agente cree.
 */
export function StrategyStudio({
  visual,
  pro,
  children,
}: {
  /** Contenido del tab "Asistente visual" (bloques UX del editor). */
  visual?: ReactNode;
  /** Contenido del tab "Código pro" (editor). */
  pro?: ReactNode;
  /** Alias de `visual` si se pasa como hijo único. */
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<"visual" | "pro">("visual");

  const tabs = [
    { id: "visual", label: "Asistente visual" },
    { id: "pro", label: "Código pro" },
  ] as const;

  return (
    <section className="qb-glass qb-elev-2 rounded-xl p-4">
      <div role="tablist" aria-label="Modo de edición" className="flex gap-2">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                active ? "qb-btn-primary" : "qb-btn-secondary",
                "h-9 rounded-md px-3 text-[13px] font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">{tab === "visual" ? (visual ?? children) : pro}</div>
    </section>
  );
}
