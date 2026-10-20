// Persistencia dual: Supabase (fuente de verdad) + localStorage (cache rápido).
// Supabase sobrevive a cierre de sesión y cambio de dispositivo.
// localStorage permite lectura instantánea sin esperar la red.
import type { BacktestResult } from "@/lib/api";

const cacheKey = (userId?: string) => `ql_runs:${userId || "guest"}`;

// --- Helpers localStorage ---
function readAll(userId?: string): BacktestResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BacktestResult[]) : [];
  } catch {
    return [];
  }
}

function writeAll(runs: BacktestResult[], userId?: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(cacheKey(userId), JSON.stringify(runs)); } catch { /* La nube sigue siendo la fuente de verdad. */ }
}

// --- API Supabase ---
async function supabaseUpsert(run: BacktestResult, userId: string): Promise<void> {
  const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
  const sb = createBrowserSupabaseClient();
  const c = run.config ?? ({} as BacktestResult["config"]);
  // IMPORTANTE: las columnas de aquí deben existir en public.strategies.
  // NO hay columna `config`: los parámetros viven en columnas planas
  // (code, capital, commission, folds, split, slippage). Escribir `config`
  // devuelve 400 PGRST204 y el run se perdía en silencio.
  const { error } = await sb.from("strategies").upsert({
    id: run.id,
    user_id: userId,
    title: `${c.symbol} · ${c.timeframe}`,
    code: c.code ?? "",
    asset_type: c.asset_type,
    symbol: c.symbol,
    timeframe: c.timeframe,
    capital: c.capital,
    commission: c.commission,
    slippage: c.slippage,
    folds: c.folds,
    split: c.split,
    metrics: run.metrics as unknown as Record<string, unknown>,
    equity: run.equity_curve ?? [],
    integrity: run.integrity_label,
    status: "tested",
    created_at: run.created_at,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`No se pudo guardar la estrategia: ${error.message}`);
}

async function supabaseFetch(userId: string): Promise<BacktestResult[]> {
  const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
  const sb = createBrowserSupabaseClient();
  const { data, error } = await sb
    .from("strategies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("No se pudieron sincronizar tus estrategias.");
  if (!data) return [];

  // Filas del schema viejo (estrategias sin resultado) NO son runs válidos:
  // carecen de métricas numéricas y crashearían cualquier .toFixed(). Se omiten.
  const out: BacktestResult[] = [];
  for (const row of data) {
    if (!row?.id) continue;
    const metrics = row.metrics as BacktestResult["metrics"] | null | undefined;
    if (!metrics || typeof metrics.sharpe_oos !== "number") continue;
    // `strategies` no tiene columna `config`: se reconstruye desde las
    // columnas planas para que results/publish tengan symbol/code/etc.
    const config = {
      asset_type: row.asset_type ?? "crypto",
      symbol: row.symbol ?? "",
      timeframe: row.timeframe ?? "1d",
      code: row.code ?? "",
      capital: row.capital ?? 1000,
      commission: row.commission ?? 0.001,
      slippage: row.slippage ?? 0.0005,
      folds: row.folds ?? 3,
      split: row.split ?? 70,
    } as unknown as BacktestResult["config"];
    out.push({
      id: row.id,
      config,
      created_at: row.created_at ?? new Date().toISOString(),
      metrics,
      integrity_label: row.integrity ?? "High",
      equity_curve: (row.equity ?? []) as BacktestResult["equity_curve"],
    });
  }
  return out;
}

// --- API pública ---
/** Guarda un run: localStorage (inmediato) + Supabase (async con user_id).
 *  Si la nube falla, lanza — el llamador decide si avisar al usuario.
 *  El run YA quedó en localStorage, así que nunca se pierde el trabajo. */
export async function saveRun(run: BacktestResult): Promise<void> {
  if (typeof window === "undefined") return;
  const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
  const sb = createBrowserSupabaseClient();
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user?.id;
  const all = readAll(userId);
  all.unshift(run);
  writeAll(all, userId);
  if (!userId) return; // sin sesión: solo cache local, sin error
  await supabaseUpsert(run, userId);
}

/** Guarda un run con user_id explícito (preferido). */
export function saveRunForUser(run: BacktestResult, userId: string): void {
  if (typeof window === "undefined") return;
  const all = readAll(userId);
  all.unshift(run);
  writeAll(all, userId);
  supabaseUpsert(run, userId).catch(() => {});
}

/** Busca un run por id en localStorage. */
export function getRun(id: string, userId?: string): BacktestResult | null {
  return readAll(userId).find((r) => r.id === id) ?? null;
}

/** Lista todos los runs de localStorage (más recientes primero). */
export function getRuns(userId?: string): BacktestResult[] {
  return readAll(userId);
}

/** Carga runs desde Supabase y los sincroniza a localStorage.
 *  Usar al montar el dashboard para recuperar estrategias perdidas. */
export async function syncRunsFromSupabase(userId: string): Promise<BacktestResult[]> {
  const remote = await supabaseFetch(userId);
  const local = readAll(userId);
  const ids = new Set(remote.map((run) => run.id));
  const merged = [...remote, ...local.filter((run) => !ids.has(run.id))];
  writeAll(merged, userId);
  return merged;
}
