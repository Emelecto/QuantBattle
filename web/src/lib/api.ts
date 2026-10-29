// Cliente del motor de backtest (worker QuantBattle).
// El worker permite los orígenes configurados y exige una sesión Supabase.
// La persistencia de resultados se gestiona en runs.ts, con caché por cuenta.
//
// CONTRATO: split es ENTERO (porcentaje de train, ej. 70), NO fracción.

import { fetchWithWakeRetry } from "./worker-fetch";
import { createBrowserSupabaseClient } from "./supabase/client";

export type AssetType = "crypto" | "stock" | "etf";
export type Timeframe =
  | "1m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "12h"
  | "1d" | "3d" | "1w" | "1M" | "1wk" | "1mo";
export type IntegrityLabel = "High" | "Low";

/** Cuerpo que el worker espera en /backtest y /backtest/validate. */
export interface StrategyConfig {
  code: string;
  asset_type: AssetType;
  symbol: string;
  timeframe: Timeframe;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  capital: number;
  commission: number; // fracción, p.ej. 0.001 (= 0.1%)
  slippage: number; // fracción, p.ej. 0.0005 (= 0.05%) por lado
  folds: number; // int, p.ej. 3
  split: number; // entero = % train, p.ej. 70 (NO 0.7)
}

export interface Metrics {
  sharpe_is: number;
  sharpe_oos: number;
  deflated_sharpe_oos: number;
  sortino: number;
  maxdd: number;
  winrate: number;
  n_trades: number;
  ret_total: number;
  vol: number;
}

export interface EquityPoint {
  t: string; // YYYY-MM-DD
  is: number;
  oos: number;
}

/** Respuesta 200 de /backtest (más los campos locales que añadimos al guardar). */
export interface BacktestResult {
  id: string;
  config: StrategyConfig;
  created_at: string;
  metrics: Metrics;
  integrity_label: IntegrityLabel;
  equity_curve: EquityPoint[];
  /** Lectura honesta generada por el worker (out-of-sample). Opcional. */
  report?: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/** Error tipado: distingue fallo de red (status ausente) de 400 del worker. */
export class BacktestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "BacktestError";
    this.status = status;
  }
}

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, "") || "http://localhost:8001";

/** Timeout por intento: el cold start de Render tarda ~50 s. */
const WORKER_TIMEOUT_MS = 55_000;
/** Intentos ante 502/503/504 o timeout (cold start). */
const WORKER_MAX_ATTEMPTS = 3;

/** Callback de UI visible mientras se despierta el worker. */
export type OnWake = (attempt: number, maxAttempts: number) => void;

async function postJson<T>(
  path: string,
  config: StrategyConfig,
  opts: { timeoutMs?: number; maxAttempts?: number; onWake?: OnWake } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? WORKER_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? WORKER_MAX_ATTEMPTS;
  const { data, error } = await createBrowserSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new BacktestError("Inicia sesión para ejecutar un backtest.", 401);
  let res: Response;
  try {
    res = await fetchWithWakeRetry(
      `${WORKER_URL}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      },
      { timeoutMs, maxAttempts, onAttempt: opts.onWake },
    );
  } catch {
    throw new BacktestError(
      "No se pudo conectar al motor. Espera unos segundos y vuelve a intentarlo.",
    );
  }

  if (!res.ok) {
    // 502/503/504 tras agotar reintentos = worker aún dormido o caído.
    if ([502, 503, 504].includes(res.status)) {
      throw new BacktestError(
        "El worker está despertando (cold start) y no respondió a tiempo. Espera unos segundos y reintenta.",
        res.status,
      );
    }
    let message = "El motor rechazó la solicitud.";
    try {
      const data = (await res.json()) as { error?: string; detail?: string };
      if (res.status === 401) message = "Tu sesión ha expirado. Inicia sesión de nuevo.";
      else if (data?.error || data?.detail) message = data.error || data.detail || message;
    } catch {
      /* cuerpo no legible: dejamos el mensaje por defecto */
    }
    throw new BacktestError(message, res.status);
  }

  return (await res.json()) as T;
}

/** Ejecuta el backtest walk-forward real contra el worker. */
export async function runBacktest(
  config: StrategyConfig,
  onWake?: OnWake,
): Promise<BacktestResult> {
  return postJson<BacktestResult>("/backtest", config, { onWake });
}

/**
 * Valida sintaxis/seguridad del código. El worker rechaza 'import os',
 * 'subprocess', '__import__', 'eval('. Los fallos de conexión se muestran al usuario.
 */
export async function validateStrategy(
  config: StrategyConfig,
): Promise<ValidationResult> {
  return postJson<ValidationResult>("/backtest/validate", config);
}
