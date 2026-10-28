"use client";
import { notifyStorageChange, useStorageValue } from "@/hooks/useStorageValue";

import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "./analytics";

/**
 * Checklist de activación: crea → corre → publica → compite.
 *
 * Persistencia en dos niveles:
 * 1. localStorage (`ql_activation`) — instantáneo, funciona sin login.
 * 2. Servidor (`/api/activation`, tabla `activation_progress`) — sobrevive
 *    cambios de dispositivo; el cliente fusiona ambos (OR de pasos).
 *
 * La recompensa QP se reclama con `claimStepReward`, que usa el endpoint de
 * tokens existente (`earnQP`) UNA sola vez por paso (flag `rewarded_*`).
 */

export type ActivationStepId = "crea" | "corre" | "publica" | "compite";

export type ActivationStep = {
  id: ActivationStepId;
  n: number;
  titulo: string;
  detalle: string;
  qp: number;
  cta: { label: string; href: string };
};

export const ACTIVATION_STEPS: ActivationStep[] = [
  {
    id: "crea",
    n: 1,
    titulo: "Crea tu estrategia",
    detalle: "Usa la plantilla SMA lista en <1 min.",
    qp: 10,
    cta: { label: "Crear", href: "/app/strategies/new?demo=1" },
  },
  {
    id: "corre",
    n: 2,
    titulo: "Corre tu primer backtest",
    detalle: "Un clic: valida OOS con datos reales.",
    qp: 15,
    cta: { label: "Correr", href: "/demo" },
  },
  {
    id: "publica",
    n: 3,
    titulo: "Publícala en el marketplace",
    detalle: "Compártela y gana QP por suscripciones.",
    qp: 25,
    cta: { label: "Publicar", href: "/app/strategies" },
  },
  {
    id: "compite",
    n: 4,
    titulo: "Compite en un torneo",
    detalle: "Envía tu modelo al round activo.",
    qp: 50,
    cta: { label: "Competir", href: "/app/tournaments" },
  },
];

export const ACTIVATION_TOTAL_QP = ACTIVATION_STEPS.reduce((a, s) => a + s.qp, 0);

const STORAGE_KEY = "ql_activation";

export type ActivationState = Record<ActivationStepId, boolean>;

const EMPTY: ActivationState = { crea: false, corre: false, publica: false, compite: false };

function readLocal(): ActivationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ActivationState>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

/** Marca un paso como completado (local + servidor, idempotente). */
export function markStep(id: ActivationStepId): void {
  if (typeof window === "undefined") return;
  const current = readLocal();
  if (current[id]) return;
  const next = { ...current, [id]: true };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyStorageChange(STORAGE_KEY);
  } catch {
    /* noop */
  }
  void trackEvent("activation_step", { step: id });
  fetch("/api/activation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step: id }),
  }).catch(() => undefined);
}

/** Primer paso pendiente (la "siguiente acción"). Null si todo completo. */
export function nextPending(state: ActivationState): ActivationStep | null {
  return ACTIVATION_STEPS.find((s) => !state[s.id]) ?? null;
}

export function useActivation() {
  const raw = useStorageValue(STORAGE_KEY);
  const state: ActivationState = { ...EMPTY };
  try {
    const saved = JSON.parse(raw || "{}");
    for (const step of ACTIVATION_STEPS) state[step.id] = saved?.[step.id] === true;
  } catch { /* Corrupt local progress starts empty. */ }
  const [server, setServer] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/activation").then((r) => r.ok ? r.json() : null).then((json) => {
      if (!active || !json?.steps || typeof json.steps !== "object") return;
      const merged = readLocal();
      for (const step of ACTIVATION_STEPS) if (json.steps[step.id] === true) merged[step.id] = true;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); notifyStorageChange(STORAGE_KEY); } catch { /* optional persistence */ }
      setServer(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const complete = useCallback((id: ActivationStepId) => markStep(id), []);
  const done = ACTIVATION_STEPS.filter((step) => state[step.id]).length;
  return { state, done, total: ACTIVATION_STEPS.length, server, complete, next: nextPending(state) };
}
