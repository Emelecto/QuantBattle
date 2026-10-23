/**
 * Cliente unificado de torneos + marketplace + QP para QuantLab.
 * Fuente: Worker FastAPI (NEXT_PUBLIC_WORKER_URL).
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { fetchWithWakeRetry } from "@/lib/worker-fetch";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  type: "weekly" | "monthly" | "kaggle" | "express" | "community" | "ml";
  status: "draft" | "open" | "closed" | "evaluating" | "completed";
  asset_type: string;
  symbols: string[];
  timeframe: string;
  data_start: string;
  data_end: string;
  eval_end: string;
  submission_deadline: string;
  prize_pool_qp: number;
  sponsor_prize_desc?: string;
  primary_metric: string;
  min_trades: number;
  max_slippage_pct: number;
  rules_text?: string;
  created_at: string;
  submission_count?: number;
}

export interface TournamentSummary {
  id: string;
  name: string;
  type: "sharpe" | "returns" | "sortino" | "custom";
  status: "active" | "upcoming" | "finished";
  asset_type: "crypto" | "stock" | "any";
  symbol?: string;
  qp_prize: number;
  deadline: string;
  participants: number;
  max_participants?: number;
  metric_label: string;
  metric_value?: string;
}

export interface Submission {
  id: string;
  tournament_id: string;
  user_id: string;
  code: string;
  config: Record<string, unknown>;
  metrics?: Record<string, number>;
  integrity_label?: string;
  primary_score?: number;
  rank?: number;
  qp_staked: number;
  qp_earned: number;
  status: string;
  submitted_at: string;
}

export interface LeaderboardEntry {
  tournament_id?: string;
  user_id: string;
  submission_id?: string;
  rank: number;
  score: number;
  qp_earned: number;
  badge_earned?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface PublicLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  country?: string | null;
  qp_earned: number;
  tournaments_won: number;
  sharpe_best?: number;
  tier?: string;
}

export interface TokenBalance {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  tier: "free" | "plus" | "pro" | "legend";
  updated_at: string;
}

export interface TokenLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  ref_id?: string;
  memo?: string;
  created_at: string;
}

export interface MarketplaceStrategy {
  catalog_available?: boolean;
  id: string;
  author_id: string;
  title: string;
  slug: string;
  description?: string;
  tags: string[];
  asset_type: string;
  symbol: string;
  timeframe: string;
  code?: string;
  is_public_code: boolean;
  is_public?: boolean;
  config: Record<string, unknown>;
  backtest_metrics?: Record<string, number>;
  backtest_equity?: Array<{ t: string; is?: number; oos?: number }>;
  price_qp_week: number;
  price_qp: number;
  subscribers: number;
  total_copies: number;
  rating?: number;
  avg_rating?: number;
  sharpe?: number;
  max_dd?: number;
  status: string;
  created_at: string;
  published_at?: string;
  author?: string;
  author_name?: string;
  author_avatar?: string;
  // Campos de integridad (Fase 2 — migración 0012). Se leen con fallback
  // para no romper si la migración aún no se ha aplicado en Supabase.
  delivers?: "signals" | "package" | string;
  replicable?: boolean;
  bench_buyhold?: number;
  bench_ma?: number;
  method?: string;
  integrity_label?: string;
  author_integrity_streak?: number;
  profiles?: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
  } | null;
}

export interface Signal {
  id: string;
  strategy_id: string;
  symbol: string;
  direction: "long" | "short" | "close";
  strength?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Subscription {
  id: string;
  strategy_id: string;
  subscriber_id: string;
  copy_config?: Record<string, unknown>;
  is_paper: boolean;
  broker_account?: string;
  status: string;
  started_at: string;
  expires_at?: string;
  qp_spent_total: number;
  paper_pnl?: number;
  strategy_title?: string;
  symbol?: string;
  price_qp: number;
}

export type LeaderboardTab = "qp" | "tournaments" | "country";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function resolveWorkerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, "");
  if (configured) return configured;
  // Sin variable configurada: en producción el fallback a localhost:8001
  // es inalcanzable desde el navegador, así que se falla con mensaje claro
  // en vez de un silencioso "Failed to fetch".
  if (process.env.NODE_ENV === "production") {
    const err = new Error(
      "NEXT_PUBLIC_WORKER_URL no está configurada en Vercel. Ve a Settings → Environment Variables y añade la URL de tu worker en Render (ej: https://tu-worker.onrender.com).",
    ) as Error & { code?: string };
    err.code = "WORKER_URL_MISSING";
    throw err;
  }
  return "http://localhost:8001";
}

// Diagnóstico: en producción, sin NEXT_PUBLIC_WORKER_URL el fetch SIEMPRE falla
// porque cae al fallback localhost:8001, que el navegador no puede alcanzar.
// Esto da un error descriptivo en vez de "Failed to fetch" genérico.
function preflight(): string {
  const worker = resolveWorkerUrl();
  if (
    (worker.startsWith("http://localhost") || worker.startsWith("http://127.0.0.1")) &&
    process.env.NODE_ENV === "production" &&
    (typeof window === "undefined" || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))
  ) {
    throw new Error(
      "NEXT_PUBLIC_WORKER_URL no está configurada en Vercel. Ve a Settings → Environment Variables y añade la URL de tu worker en Render (ej: https://tu-worker.onrender.com).",
    );
  }
  return worker;
}

/** Timeout por intento: el cold start de Render tarda ~50 s. */
const WORKER_TIMEOUT_MS = 55_000;
/** Intentos ante 502/503/504/429 o timeout (cold start). */
const WORKER_MAX_ATTEMPTS = 3;

export type CallOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  onWake?: (attempt: number, maxAttempts: number) => void;
};

/**
 * Detecta errores típicos de CORS / red bloqueada en el navegador.
 * Un fallo CORS se manifiesta como TypeError: Failed to fetch sin status
 * HTTP, indistinguible a priori de un corte de red: por eso el mensaje
 * sugiere ambas causas. Revisa también `cause` (el WORKER_UNREACHABLE
 * envuelve el error original ahí).
 */
export function isCorsLikeError(err: unknown): boolean {
  const texts: string[] = [];
  if (err instanceof Error) {
    texts.push(err.message);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) texts.push(cause.message);
    else if (typeof cause === "string") texts.push(cause);
  } else if (typeof err === "string") {
    texts.push(err);
  }
  const joined = texts.join(" ").toLowerCase();
  return (
    joined.includes("failed to fetch") ||
    joined.includes("networkerror") ||
    joined.includes("network request failed") ||
    joined.includes("load failed") ||
    joined.includes("cors")
  );
}

/** True si el fallo es 401 / sesión ausente o expirada (no es fallo de red). */
export function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as Error & { code?: unknown }).code;
    if (code === "UNAUTHENTICATED") return true;
    const status = (err as Error & { status?: unknown }).status;
    if (status === 401) return true;
  }
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return msg.toLowerCase().includes("inicia sesión") || msg.includes("401");
}

export async function call<T>(
  path: string,
  init?: RequestInit,
  opts: CallOptions = {},
): Promise<T> {
  let workerUrl: string;
  try {
    workerUrl = preflight();
  } catch (e) {
    console.error(`[tournaments] configuración inválida para ${path}:`, e);
    throw e;
  }
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Anti-cache: timestamp para evitar que el navegador sirva respuestas cacheadas viejas.
  const cacheBust = `${path.includes("?") ? "&" : "?"}_t=${Date.now()}`;
  // Cold start de Render (~50 s o 502/503/504): fetchWithWakeRetry reintenta
  // con backoff en vez de un solo fetch, igual que el backtest.
  const timeoutMs = opts.timeoutMs ?? WORKER_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? WORKER_MAX_ATTEMPTS;
  let res: Response;
  try {
    res = await fetchWithWakeRetry(
      `${workerUrl}${path}${cacheBust}`,
      { ...init, headers },
      { timeoutMs, maxAttempts, onAttempt: opts.onWake },
    );
  } catch (originalError) {
    console.error(
      `[tournaments] ${path} falló tras ${maxAttempts} intentos contra ${workerUrl}:`,
      originalError,
    );
    const corsHint = isCorsLikeError(originalError);
    const err = new Error(
      `No se pudo conectar con el worker en ${workerUrl}${path} tras ${maxAttempts} intentos. ` +
        (corsHint
          ? "Esto puede ser CORS o bloqueador del navegador (ad-block, VPN o extensiones de privacidad): desactívalos y reintenta."
          : "Reintenta en unos segundos (puede estar despertando tras inactividad) y revisa tu conexión o bloqueadores del navegador."),
    ) as Error & { code?: string; cause?: unknown };
    err.code = "WORKER_UNREACHABLE";
    err.cause = originalError;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 = sin sesión válida, NO fallo de red: no reintentar, pedir login.
    // fetchWithWakeRetry solo reintenta fallos de red y 502/503/504/429, así
    // que el 401 llega aquí tras un único intento.
    if (res.status === 401) {
      const body401 = json as { error?: unknown; detail?: unknown };
      const detail401 =
        typeof body401.error === "string"
          ? body401.error
          : typeof body401.detail === "string"
            ? body401.detail
            : `HTTP ${res.status}`;
      const message401 = `${path}: inicia sesión para continuar (HTTP 401: ${detail401}). Tu sesión puede haber expirado.`;
      console.error(`[tournaments] ${message401}`, { status: res.status, body: json });
      const err401 = new Error(message401) as Error & {
        code?: string;
        status?: number;
      };
      err401.code = "UNAUTHENTICATED";
      err401.status = 401;
      throw err401;
    }
    // Incluir el path: /app/admin dispara 3 llamadas en Promise.all y sin
    // esto es imposible saber cuál falló. Leer también `detail` porque
    // FastAPI serializa HTTPException como {detail}, no como {error}.
    const detail =
      (json as any).error || (json as any).detail || `HTTP ${res.status}`;
    const message = `${path}: ${detail}`;
    console.error(`[tournaments] ${message}`, { status: res.status, body: json });
    const err = new Error(message) as Error & { code?: string };
    if (res.status === 502 || res.status === 503) err.code = "WORKER_UNAVAILABLE";
    else if (res.status === 504) err.code = "WORKER_TIMEOUT";
    throw err;
  }
  return json as T;
}

function getSupabase() {
  return createBrowserSupabaseClient();
}

/* ------------------------------------------------------------------ */
/* Torneos                                                             */
/* ------------------------------------------------------------------ */

export async function listTournaments(filters?: {
  type?: string;
  status?: string;
}): Promise<Tournament[]> {
  const q = new URLSearchParams();
  if (filters?.type) q.set("type", filters.type);
  if (filters?.status) q.set("status", filters.status);
  return call<Tournament[]>(`/tournament/list?${q.toString()}`);
}

export async function getTournament(id: string): Promise<Tournament> {
  return call<Tournament>(`/tournament/${id}`);
}

export async function submitToTournament(
  id: string,
  code: string,
  config: Record<string, unknown>,
  qpStake: number,
  replace = false,
): Promise<Submission> {
  return call<Submission>(`/tournament/submit`, {
    method: "POST",
    body: JSON.stringify({
      tournament_id: id,
      code,
      config,
      qp_stake: qpStake,
      replace,
    }),
  });
}

export async function getLeaderboard(
  id: string,
): Promise<LeaderboardEntry[]> {
  return call<LeaderboardEntry[]>(`/tournament/${id}/leaderboard`);
}

export async function getMySubmission(id: string): Promise<Submission | null> {
  try {
    return await call<Submission>(`/tournament/${id}/my-submission`);
  } catch {
    return null;
  }
}

// Compatibilidad con páginas que usan TournamentSummary
export async function getTournaments(
  status?: "active" | "upcoming" | "finished",
): Promise<TournamentSummary[]> {
  const list = await listTournaments({ status });
  return list.map((t) => ({
    id: t.id,
    name: t.name,
    type: "custom" as const,
    status:
      t.status === "open"
        ? "active"
        : t.status === "draft"
          ? "upcoming"
          : "finished",
    asset_type: t.asset_type as "crypto" | "stock" | "any",
    symbol: t.symbols?.[0],
    qp_prize: t.prize_pool_qp,
    deadline: t.submission_deadline,
    participants: t.submission_count ?? 0,
    metric_label: t.primary_metric,
  }));
}

/* ------------------------------------------------------------------ */
/* Leaderboard Global (Supabase directo, no via worker)               */
/* ------------------------------------------------------------------ */

export async function getGlobalLeaderboard(
  tab: LeaderboardTab = "qp",
  limit = 100,
): Promise<PublicLeaderboardEntry[]> {
  const supabase = getSupabase();
  const common = "id, username, avatar_url, country, total_qp_earned, tournaments_won";

  if (tab === "qp") {
    const { data, error } = await supabase
      .from("profiles")
      .select(common)
      .gt("total_qp_earned", 0)
      .order("total_qp_earned", { ascending: false })
      .limit(limit);
    if (error) throw new Error("No se pudo cargar el ranking. Vuelve a intentarlo.");
    if (!data) return [];
    return data.map((p: any, i: number) => ({
      rank: i + 1,
      user_id: p.id,
      username: p.username ?? "trader",
      avatar_url: p.avatar_url ?? null,
      country: p.country ?? null,
      qp_earned: Number(p.total_qp_earned ?? 0),
      tournaments_won: Number(p.tournaments_won ?? 0),
      sharpe_best: undefined,
      tier: p.tier ?? "bronze",
    }));
  }

  if (tab === "tournaments") {
    const { data, error } = await supabase
      .from("profiles")
      .select(common)
      .gt("tournaments_won", 0)
      .order("tournaments_won", { ascending: false })
      .order("total_qp_earned", { ascending: false })
      .limit(limit);
    if (error) throw new Error("No se pudo cargar el ranking. Vuelve a intentarlo.");
    if (!data) return [];
    return data.map((p: any, i: number) => ({
      rank: i + 1,
      user_id: p.id,
      username: p.username ?? "trader",
      avatar_url: p.avatar_url ?? null,
      country: p.country ?? null,
      qp_earned: Number(p.total_qp_earned ?? 0),
      tournaments_won: Number(p.tournaments_won ?? 0),
      sharpe_best: undefined,
      tier: p.tier ?? "bronze",
    }));
  }

  // country tab
  const { data, error } = await supabase
    .from("profiles")
    .select(common)
    .gt("total_qp_earned", 0)
    .order("total_qp_earned", { ascending: false })
    .limit(limit * 2);
  if (error) throw new Error("No se pudo cargar el ranking. Vuelve a intentarlo.");
  if (!data) return [];

  const grouped = new Map<string, PublicLeaderboardEntry>();
  for (const p of data as any[]) {
    const c = p.country ?? "ZZ";
    const existing = grouped.get(c);
    if (existing) {
      existing.qp_earned += Number(p.total_qp_earned ?? 0);
      existing.tournaments_won += Number(p.tournaments_won ?? 0);
    } else {
      grouped.set(c, {
        rank: 0,
        user_id: p.id,
        username: p.country ?? "Desconocido",
        avatar_url: null,
        country: p.country ?? null,
        qp_earned: Number(p.total_qp_earned ?? 0),
        tournaments_won: Number(p.tournaments_won ?? 0),
        sharpe_best: undefined,
        tier: p.tier ?? "bronze",
      });
    }
  }
  return Array.from(grouped.values())
    .sort((a, b) => b.qp_earned - a.qp_earned)
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/* ------------------------------------------------------------------ */
/* Marketplace                                                         */
/* ------------------------------------------------------------------ */

/** Normaliza una fila del worker al shape que consume la UI.
 *
 * El worker devuelve las columnas crudas de `marketplace_strategies`
 * (`price_qp_week`, `avg_rating`, `profiles{username}`) mientras que las
 * tarjetas leen `price_qp`, `rating` y `author`. Sin este puente los valores
 * llegaban `undefined` y el filtro de precio del marketplace descartaba
 * TODAS las estrategias (undefined >= 0 es false), así que lo recién
 * publicado nunca se veía.
 */
function normalizeMarketplaceRow(raw: any): MarketplaceStrategy {
  const profile = raw?.profiles ?? {};
  const metrics = raw?.backtest_metrics ?? {};
  const priceWeek = Number(raw?.price_qp_week ?? raw?.price_qp ?? 0);
  const sharpe =
    typeof metrics.sharpe_oos === "number"
      ? metrics.sharpe_oos
      : typeof metrics.sharpe === "number"
        ? metrics.sharpe
        : undefined;
  const maxdd =
    typeof metrics.maxdd === "number" ? metrics.maxdd * 100 : undefined;

  return {
    ...raw,
    price_qp: Number.isFinite(priceWeek) ? priceWeek : 0,
    price_qp_week: Number.isFinite(priceWeek) ? priceWeek : 0,
    rating: raw?.avg_rating ?? raw?.rating ?? 0,
    avg_rating: raw?.avg_rating ?? null,
    author: profile.username ?? profile.display_name ?? raw?.author ?? "anónimo",
    author_name: profile.display_name ?? profile.username ?? undefined,
    author_avatar: profile.avatar_url ?? undefined,
    subscribers: Number(raw?.subscribers ?? 0),
    total_copies: Number(raw?.total_copies ?? 0),
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    sharpe,
    max_dd: maxdd,
  } as MarketplaceStrategy;
}

export async function getMarketplaceStrategies(
  filters?: { asset_type?: string; symbol?: string; min_price?: number },
): Promise<MarketplaceStrategy[]> {
  const q = new URLSearchParams();
  if (filters?.asset_type) q.set("asset_type", filters.asset_type);
  if (filters?.symbol) q.set("symbol", filters.symbol);
  const rows = await call<any[]>(`/marketplace?${q.toString()}`);
  return (Array.isArray(rows) ? rows : []).map(normalizeMarketplaceRow);
}

export async function publishStrategy(data: {
  title: string;
  description?: string;
  tags?: string[];
  asset_type: string;
  symbol: string;
  timeframe: string;
  code?: string;
  is_public_code?: boolean;
  config: Record<string, unknown>;
  price_qp_week?: number;
}): Promise<{ id: string; status: "published" | "needs_review" }> {
  return call<{ id: string; status: "published" | "needs_review" }>(`/marketplace/publish`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function subscribeToStrategy(id: string): Promise<Subscription> {
  return call<Subscription>(`/marketplace/${id}/subscribe`, { method: "POST" });
}

export async function unsubscribeFromStrategy(id: string): Promise<void> {
  await call<void>(`/marketplace/${id}/unsubscribe`, { method: "POST" });
}

export async function getSignals(strategyId: string): Promise<Signal[]> {
  return call<Signal[]>(`/signals/${strategyId}`);
}

/** Señales recientes de una estrategia del marketplace (vía worker). */
export async function getStrategySignals(
  id: string,
  limit = 20,
): Promise<Signal[]> {
  return call<Signal[]>(`/marketplace/${id}/signals?limit=${limit}`);
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  return call<Subscription[]>(`/marketplace/my-subscriptions`);
}

export async function getProfileTournamentHistory(
  userId: string,
): Promise<any[]> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase
    .from("tournament_participants")
    .select("*, tournaments(*)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  return data || [];
}
