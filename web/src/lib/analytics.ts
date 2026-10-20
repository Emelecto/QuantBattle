"use client";

/**
 * Analítica mínima de onboarding — sin dependencias externas.
 *
 * Objetivo producto: medir el tiempo hasta el aha-moment (`first_backtest`).
 * - `markOnboardingStart()` se llama al entrar a /demo o /app (primera vez).
 * - `trackFirstBacktest(source)` se llama al completar el primer backtest con
 *   éxito; devuelve los ms transcurridos desde el inicio (null si ya existía).
 * - Todo persiste en localStorage (funciona sin login) y se reintenta al
 *   servidor vía POST /api/events (best-effort: nunca rompe la UX).
 */

const START_KEY = "ql_onboarding_start";
const DONE_KEY = "ql_first_backtest";
const LOG_KEY = "ql_events";

export type AhaSource = "demo" | "studio";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

/** Marca el inicio del onboarding (solo la primera vez). */
export function markOnboardingStart(): void {
  if (typeof window === "undefined") return;
  if (!safeGet(START_KEY)) {
    safeSet(START_KEY, String(Date.now()));
    void trackEvent("onboarding_started");
  }
}

/**
 * Registra el primer backtest. Idempotente: solo el primero cuenta.
 * @returns ms desde el inicio del onboarding, o null si no es el primero.
 */
export function trackFirstBacktest(source: AhaSource): number | null {
  if (typeof window === "undefined") return null;
  if (safeGet(DONE_KEY)) return null;
  const start = Number(safeGet(START_KEY) ?? Date.now());
  const elapsedMs = Date.now() - (Number.isFinite(start) ? start : Date.now());
  safeSet(DONE_KEY, JSON.stringify({ at: new Date().toISOString(), source, elapsedMs }));
  void trackEvent("first_backtest", { source, elapsed_ms: elapsedMs });
  return elapsedMs;
}

/** ¿Ya ocurrió el aha-moment? + tiempo que tomó. */
export function getTimeToAha(): { done: boolean; elapsedMs: number | null } {
  if (typeof window === "undefined") return { done: false, elapsedMs: null };
  const raw = safeGet(DONE_KEY);
  if (!raw) return { done: false, elapsedMs: null };
  try {
    const parsed = JSON.parse(raw) as { elapsedMs?: number };
    return {
      done: true,
      elapsedMs: typeof parsed.elapsedMs === "number" ? parsed.elapsedMs : null,
    };
  } catch {
    return { done: true, elapsedMs: null };
  }
}

/** Evento genérico: log local + POST best-effort a /api/analytics/event
 *  (allowlist sanitizada, reenvío a Plausible en prod). */
export function trackEvent(name: string, props?: Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  try {
    const log = JSON.parse(safeGet(LOG_KEY) ?? "[]") as Array<unknown>;
    log.push({ name, props: props ?? {}, at: new Date().toISOString() });
    safeSet(LOG_KEY, JSON.stringify(log.slice(-100)));
  } catch {
    /* noop */
  }
  return fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: name, props: props ?? {} }),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Contrato del funnel de activación (consumido por
 * GET /api/analytics/funnel y el dashboard de Plausible).
 * Orden = orden del funnel: inicio → tour → aha-moment → activación.
 */
import { ANALYTICS_EVENTS } from "./analytics-events";
export { ANALYTICS_EVENTS } from "./analytics-events";

export type { AnalyticsEventName } from "./analytics-events";
export { FUNNEL_STEPS } from "./analytics-events";
