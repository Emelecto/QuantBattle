"use client";
import { useHydrated } from "@/hooks/useHydrated";

import { useState } from "react";

const STORAGE_KEY = "ql_tour_done";

type Step = {
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: "1 · Crea tu estrategia",
    body: "En QuantBattle puedes armar tu estrategia con el asistente visual o escribiendo código Python. Elige el activo, el capital y los parámetros de walk-forward.",
  },
  {
    title: "2 · Prueba con datos reales OOS",
    body: "Corre un backtest walk-forward: tu estrategia se entrena en una parte y se evalúa con datos que nunca vio. Así evitas el overfitting.",
  },
  {
    title: "3 · Compárala contra BTC buy & hold",
    body: "En los resultados comparamos tu estrategia contra “hacer nada” (comprar y mantener BTC). Así descubres si de verdad agregó valor.",
  },
];

/**
 * Tour de bienvenida de 3 pasos. Solo se muestra la primera vez
 * (localStorage 'ql_tour_done'). No bloquea el login: es solo ayuda.
 * Respeta prefers-reduced-motion vía la regla global de globals.css.
 */
export function Tour() {
  const hydrated = useHydrated();
  const [closed, setClosed] = useState(false);
  const open = hydrated && !closed && (() => { try { return !localStorage.getItem(STORAGE_KEY); } catch { return false; } })();
  const [step, setStep] = useState(0);

  function finish(neverShow: boolean) {
    if (neverShow) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* sin persistencia: simplemente cerramos */
      }
    }
    setClosed(true);
  }

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Tour de bienvenida"
    >
      <div className="qb-glass qb-elev-2 w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="qb-glow-box inline-block h-2.5 w-2.5 rounded-sm bg-accent"
          />
          <span className="text-sm font-semibold tracking-tight text-ink">
            Bienvenido a QuantBattle
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{current.body}</p>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === step ? "w-6 bg-accent" : "w-1.5 bg-line")
              }
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => finish(true)}
            className="text-[13px] text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            No mostrar de nuevo
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="qb-btn-secondary rounded-md px-3 py-1.5 text-[13px]"
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={() => finish(false)}
              className="qb-btn-primary rounded-md px-4 py-1.5 text-[13px]"
            >
              {isLast ? "Empezar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
