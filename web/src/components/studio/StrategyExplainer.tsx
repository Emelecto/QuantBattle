"use client";

import { cn } from "@/lib/cn";

/** Icono de bombilla (bulb) en SVG inline — sin librerías externas. */
function BulbIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.45 1.1 1.15 1.2 1.95l.1.75h4.6l.1-.75c.1-.8.6-1.5 1.2-1.95A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

/** Extrae fast=/slow= e 'invert' del código compacto de la estrategia. */
function parseCode(code: string): {
  fast?: number;
  slow?: number;
  invert: boolean;
} {
  const fastMatch = code.match(/fast\s*=\s*(\d+)/i);
  const slowMatch = code.match(/slow\s*=\s*(\d+)/i);
  const invert = /invert/i.test(code);
  return {
    fast: fastMatch ? Number(fastMatch[1]) : undefined,
    slow: slowMatch ? Number(slowMatch[1]) : undefined,
    invert,
  };
}

/**
 * Explica en español plano (para no técnicos) la estrategia representada por
 * `code`. Componente puramente presentacional: recibe props, no maneja estado.
 */
export function StrategyExplainer({ code }: { code: string }) {
  const { fast, slow, invert } = parseCode(code);
  const understood = fast !== undefined && slow !== undefined;

  const message = !understood
    ? "Estrategia personalizada (revisa el código en la pestaña Código)."
    : `Compras cuando la media móvil de ${fast} días cruza POR ENCIMA de la de ${slow} días; vendes cuando cruza por debajo.${
        invert
          ? " (señal invertida: operas en corto cuando la rápida supera a la lenta)."
          : ""
      }`;

  return (
    <section
      aria-label="Explicación de la estrategia"
      className="qb-glass qb-elev-1 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-accent">
          <BulbIcon className="h-5 w-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Qué hace tu estrategia
          </h3>
          <p className={cn("text-sm leading-relaxed text-ink")}>{message}</p>
        </div>
      </div>
    </section>
  );
}
