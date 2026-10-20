// Capa de persistencia real: Supabase (browser client).
// Source of truth para estrategias y backtests. Reemplaza el puente
// localStorage (que queda solo como caché local en el editor).
//
// Todas las funciones construyen el cliente bajo demanda (dentro de la
// función) para que `next build` no falle por variables de entorno ausentes.
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { StrategyConfig, BacktestResult } from "@/lib/api";

export type PublicStrategy = {
  id: string;
  title: string;
  symbol: string;
  asset_type: string;
  code: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  /** Deflated Sharpe OOS del run más reciente (o null si aún no hay run). */
  sharpe: number | null;
  run_id: string | null;
};

export type LeaderboardRow = {
  strategy_id: string;
  name: string;
  author: string | null;
  asset: string;
  deflatedSharpeOos: number;
  /** Max drawdown en % (positivo en magnitud). */
  maxDd: number;
  /** Win rate en %. */
  winRate: number;
  /**
   * Reputación del autor: media de sus últimos 5 envíos evaluados
   * (la calcula el worker sobre las submissions). Ausente o null si
   * aún no hay envíos con puntaje.
   */
  reputation_score?: number | null;
};

export type SupabaseRun = {
  id: string;
  metrics_json: Record<string, unknown> | null;
  equity_curve: Array<{ t: string; is: number; oos: number }> | null;
  integrity: string | null;
  created_at: string;
};

export type SupabaseStrategy = {
  id: string;
  title: string;
  symbol: string;
  asset_type: string;
  timeframe: string;
  capital: number;
  commission: number;
  folds: number;
  split: number;
  code: string;
  is_public: boolean;
  profiles: { username: string | null; display_name: string | null } | null;
  backtest_runs: SupabaseRun[] | null;
};

function getSupabase() {
  return createBrowserSupabaseClient();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Guarda una estrategia en la DB. Requiere sesión (auth.uid() = user_id por
 * RLS). Lanza "AUTH_REQUIRED" si no hay usuario logueado para que el llamador
 * redirija a /login.
 */
export async function saveStrategy(
  config: StrategyConfig,
  code: string,
  isPublic = false,
): Promise<string> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { data, error } = await supabase
    .from("strategies")
    .insert({
      user_id: user.id,
      title: `${config.symbol} ${config.asset_type}`.trim(),
      code,
      asset_type: config.asset_type,
      symbol: config.symbol,
      timeframe: config.timeframe,
      capital: config.capital,
      commission: config.commission,
      folds: config.folds,
      split: config.split,
      is_public: isPublic,
      status: "tested",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Marca una estrategia como pública/privada (por id, del usuario en sesión). */
export async function setStrategyPublic(
  strategyId: string,
  isPublic: boolean,
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { error } = await supabase
    .from("strategies")
    .update({ is_public: isPublic })
    .eq("id", strategyId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/** Guarda el resultado de un backtest ligado a una estrategia. */
export async function saveBacktestRun(
  strategy_id: string,
  result: BacktestResult,
): Promise<string> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  const { data, error } = await supabase
    .from("backtest_runs")
    .insert({
      strategy_id,
      user_id: user.id,
      status: "done",
      metrics_json: result.metrics,
      equity_curve: result.equity_curve,
      integrity: result.integrity_label,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Estrategias públicas (is_public=true), con autor y último run. */
export async function getPublicStrategies(): Promise<PublicStrategy[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("strategies")
    .select(
      "id, title, symbol, asset_type, code, created_at, profiles(username, display_name), backtest_runs(id, metrics_json, created_at)",
    )
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    symbol: string;
    asset_type: string;
    code: string;
    created_at: string;
    profiles: { username: string | null; display_name: string | null } | null;
    backtest_runs: Array<{
      id: string;
      metrics_json: Record<string, unknown> | null;
      created_at: string;
    }> | null;
  }>;

  return rows.map((s) => {
    const runs = (s.backtest_runs ?? []).slice().sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const latest = runs[0] ?? null;
    const m = (latest?.metrics_json ?? null) as
      | { deflated_sharpe_oos?: number }
      | null;
    return {
      id: s.id,
      title: s.title,
      symbol: s.symbol,
      asset_type: s.asset_type,
      code: s.code,
      created_at: s.created_at,
      username: s.profiles?.username ?? null,
      display_name: s.profiles?.display_name ?? null,
      sharpe: m?.deflated_sharpe_oos ?? null,
      run_id: latest?.id ?? null,
    };
  });
}

/** Estrategias del usuario logueado (tabla `strategies`, filtrado por user_id). */
export type MyStrategy = {
  id: string;
  title: string;
  symbol: string;
  asset_type: string;
  timeframe: string;
  code: string;
  capital: number;
  commission: number;
  folds: number;
  split: number;
  created_at: string;
  /** Estado guardado de la estrategia (p. ej. `draft` o `tested`). */
  status: string | null;
  /** Estado real de la ejecución más reciente, si existe. */
  last_run_status: string | null;
  last_run_at: string | null;
  last_sharpe_oos: number | null;
  last_maxdd: number | null;
};

/** Progreso real persistido por la Ruta Aprendiz; `null` significa sin registro. */
export type MyCourseProgress = {
  completed_modules: number[] | null;
  xp: number | null;
  streak: number | null;
  last_active_date: string | null;
};

/** Resumen mínimo de un envío para que el dashboard no cargue código sensible. */
export type TournamentSubmissionSnapshot = {
  tournament_id: string;
  status: string | null;
  score: number | null;
  rank: number | null;
  qp_earned: number | null;
  submitted_at: string | null;
};

/** Estado del envío de predicciones para la ronda ML actualmente abierta. */
export type MlTournamentSubmissionLookup = {
  tournament_id: string;
  has_ready_round: boolean;
  submission: TournamentSubmissionSnapshot | null;
};

/**
 * Carga las estrategias que el usuario ya creó (propias, por RLS user_id).
 * Devuelve [] si no hay sesión. Usado por el modal de envío a torneo para
 * precargar símbolo/timeframe/asset_type/código/config.
 */
export async function getMyStrategies(): Promise<MyStrategy[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("strategies")
    .select(
      "id, title, symbol, asset_type, timeframe, code, capital, commission, folds, split, created_at, status, backtest_runs(id, created_at, status, metrics_json)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  type StrategyRow = Omit<
    MyStrategy,
    "last_run_at" | "last_run_status" | "last_sharpe_oos" | "last_maxdd"
  > & {
    backtest_runs?: Array<{
      id: string;
      created_at: string;
      status: string | null;
      metrics_json: Record<string, unknown> | null;
    }> | null;
  };

  return ((data ?? []) as unknown as StrategyRow[]).map((strategy) => {
    const latest = (strategy.backtest_runs ?? [])
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const metrics = latest?.metrics_json ?? {};
    return {
      ...strategy,
      status: stringOrNull(strategy.status),
      last_run_at: latest?.created_at ?? null,
      last_run_status: stringOrNull(latest?.status),
      last_sharpe_oos:
        numberOrNull(metrics.sharpe_oos) ??
        numberOrNull(metrics.deflated_sharpe_oos),
      last_maxdd: numberOrNull(metrics.maxdd),
    };
  });
}

/** Lee el progreso del curso de Supabase sin asumir que exista una fila todavía. */
export async function getMyCourseProgress(): Promise<MyCourseProgress | null> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("course_progress")
    .select("completed_modules, xp, streak, last_active_date")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as {
    completed_modules?: unknown;
    xp?: unknown;
    streak?: unknown;
    last_active_date?: unknown;
  };
  const completedModules = Array.isArray(row.completed_modules)
    ? row.completed_modules.filter(
        (moduleId): moduleId is number =>
          typeof moduleId === "number" && Number.isInteger(moduleId),
      )
    : null;

  return {
    completed_modules: completedModules,
    xp: numberOrNull(row.xp),
    streak: numberOrNull(row.streak),
    last_active_date: stringOrNull(row.last_active_date),
  };
}

/**
 * Carga los envíos de estrategia propios en una sola consulta. La UI solo recibe
 * los campos necesarios para el estado, nunca el código ni la configuración.
 */
export async function getMyTournamentSubmissions(
  tournamentIds: string[],
): Promise<TournamentSubmissionSnapshot[]> {
  const ids = Array.from(new Set(tournamentIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("submissions")
    .select("tournament_id, status, primary_score, rank, qp_earned, submitted_at")
    .eq("user_id", user.id)
    .in("tournament_id", ids);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    tournament_id?: unknown;
    status?: unknown;
    primary_score?: unknown;
    rank?: unknown;
    qp_earned?: unknown;
    submitted_at?: unknown;
  }>;

  return rows.flatMap((row) => {
    const tournamentId = stringOrNull(row.tournament_id);
    if (!tournamentId) return [];
    return [
      {
        tournament_id: tournamentId,
        status: stringOrNull(row.status),
        score: numberOrNull(row.primary_score),
        rank: numberOrNull(row.rank),
        qp_earned: numberOrNull(row.qp_earned),
        submitted_at: stringOrNull(row.submitted_at),
      },
    ];
  });
}

/**
 * Relaciona cada torneo ML con su ronda `live` lista y el envío propio de esa
 * ronda. Si no hay ronda lista, se conserva esa ausencia en vez de mostrar un
 * falso "No enviado".
 */
export async function getMyMlTournamentSubmissions(
  tournamentIds: string[],
): Promise<MlTournamentSubmissionLookup[]> {
  const ids = Array.from(new Set(tournamentIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const supabase = getSupabase();
  const { data: datasets, error: datasetError } = await supabase
    .from("ml_datasets")
    .select("id, tournament_id, round_number, status")
    .in("tournament_id", ids)
    .eq("kind", "live")
    .eq("score_version", "spearman_era_v1")
    .eq("status", "ready");

  if (datasetError) throw new Error(datasetError.message);

  const latestDatasetByTournament = new Map<
    string,
    { id: string; tournament_id: string; round_number: number | null }
  >();
  for (const raw of (datasets ?? []) as Array<{
    id?: unknown;
    tournament_id?: unknown;
    round_number?: unknown;
  }>) {
    const datasetId = stringOrNull(raw.id);
    const tournamentId = stringOrNull(raw.tournament_id);
    if (!datasetId || !tournamentId) continue;
    const roundNumber = numberOrNull(raw.round_number);
    const existing = latestDatasetByTournament.get(tournamentId);
    if (!existing || (roundNumber ?? -1) > (existing.round_number ?? -1)) {
      latestDatasetByTournament.set(tournamentId, {
        id: datasetId,
        tournament_id: tournamentId,
        round_number: roundNumber,
      });
    }
  }

  const datasetIds = Array.from(latestDatasetByTournament.values()).map((dataset) => dataset.id);
  if (datasetIds.length === 0) {
    return ids.map((tournament_id) => ({
      tournament_id,
      has_ready_round: false,
      submission: null,
    }));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return ids.map((tournament_id) => ({
      tournament_id,
      has_ready_round: latestDatasetByTournament.has(tournament_id),
      submission: null,
    }));
  }

  const { data: submissions, error: submissionError } = await supabase
    .from("prediction_submissions")
    .select("dataset_id, status, score, submitted_at")
    .eq("user_id", user.id)
    .eq("is_selected", true)
    .in("dataset_id", datasetIds);

  if (submissionError) throw new Error(submissionError.message);

  const byDataset = new Map<
    string,
    { status: string | null; score: number | null; submitted_at: string | null }
  >();
  for (const raw of (submissions ?? []) as Array<{
    dataset_id?: unknown;
    status?: unknown;
    score?: unknown;
    submitted_at?: unknown;
  }>) {
    const datasetId = stringOrNull(raw.dataset_id);
    if (!datasetId) continue;
    byDataset.set(datasetId, {
      status: stringOrNull(raw.status),
      score: numberOrNull(raw.score),
      submitted_at: stringOrNull(raw.submitted_at),
    });
  }

  return ids.map((tournament_id) => {
    const dataset = latestDatasetByTournament.get(tournament_id);
    const submission = dataset ? byDataset.get(dataset.id) : null;
    return {
      tournament_id,
      has_ready_round: Boolean(dataset),
      submission: submission
        ? {
            tournament_id,
            status: submission.status,
            score: submission.score,
            rank: null,
            qp_earned: null,
            submitted_at: submission.submitted_at,
          }
        : null,
    };
  });
}

/** Posición propia por QP acumulados; los empates comparten posición. */
export type MyQpRanking = {
  rank: number;
  total: number;
  qp_earned: number;
};

/**
 * Calcula la posición desde `profiles` en vez de reutilizar un ranking de
 * demostración. Solo devuelve datos cuando el perfil y sus QP persistidos
 * existen; así el dashboard no presenta una posición inventada.
 */
export async function getMyQpRanking(): Promise<MyQpRanking | null> {
  const supabase = getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("total_qp_earned")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const qpEarned = numberOrNull(
    (profile as { total_qp_earned?: unknown } | null)?.total_qp_earned,
  );
  if (qpEarned == null) return null;

  const [totalResult, higherResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("total_qp_earned", qpEarned),
  ]);
  if (totalResult.error) throw new Error(totalResult.error.message);
  if (higherResult.error) throw new Error(higherResult.error.message);
  if (totalResult.count == null || higherResult.count == null) return null;

  return {
    rank: higherResult.count + 1,
    total: totalResult.count,
    qp_earned: qpEarned,
  };
}

/** Ranking OOS: runs de estrategias públicas, ordenado por Deflated Sharpe OOS. */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("backtest_runs")
    .select(
      "id, created_at, metrics_json, strategies!inner(id, symbol, asset_type, is_public, profiles(username))",
    )
    .eq("strategies.is_public", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    metrics_json: Record<string, unknown> | null;
    strategies: {
      id: string;
      symbol: string;
      asset_type: string;
      is_public: boolean;
      profiles: { username: string | null } | null;
    };
  }>;

  // Reputación por autor (estilo Numerai): media de las últimas 5 submissions
  // evaluadas del usuario (primary_score, más reciente primero). Null si no hay
  // envíos con puntaje — jamás se inventa valor.
  const repByUsername = new Map<string, number>();
  {
    const supabaseSubs = getSupabase();
    const { data: subs } = await supabaseSubs
      .from("submissions")
      .select("primary_score, submitted_at, profiles(username)")
      .not("primary_score", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(500);
    type SubRow = {
      primary_score: number | null;
      profiles: { username: string | null } | null;
    };
    const acc = new Map<string, number[]>();
    for (const s of ((subs ?? []) as unknown as SubRow[])) {
      const u = s.profiles?.username;
      if (!u || s.primary_score == null) continue;
      const list = acc.get(u) ?? [];
      if (list.length < 5) list.push(s.primary_score);
      acc.set(u, list);
    }
    for (const [u, v] of acc.entries()) {
      if (v.length > 0) {
        repByUsername.set(u, v.reduce((a, b) => a + b, 0) / v.length);
      }
    }
  }

  // Un run por estrategia (el más reciente) para no duplicar en el ranking.
  const byStrategy = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byStrategy.get(r.strategies.id);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
      byStrategy.set(r.strategies.id, r);
    }
  }

  const mapped: LeaderboardRow[] = Array.from(byStrategy.values()).map((r) => {
    const m = (r.metrics_json ?? {}) as {
      deflated_sharpe_oos?: number;
      maxdd?: number;
      winrate?: number;
    };
    return {
      strategy_id: r.strategies.id,
      name: r.strategies.symbol,
      author: r.strategies.profiles?.username ?? null,
      asset: r.strategies.asset_type,
      deflatedSharpeOos: m.deflated_sharpe_oos ?? 0,
      maxDd: (m.maxdd ?? 0) * 100,
      winRate: (m.winrate ?? 0) * 100,
      reputation_score:
        (r.strategies.profiles?.username &&
          repByUsername.get(r.strategies.profiles.username)) ||
        null,
    };
  });

  mapped.sort((a, b) => b.deflatedSharpeOos - a.deflatedSharpeOos);
  return mapped;
}

/** Carga una estrategia pública + su run más reciente (vista pública de resultados). */
export async function getPublicStrategy(
  strategyId: string,
): Promise<{ strategy: SupabaseStrategy; run: SupabaseRun | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("strategies")
    .select(
      "id, title, symbol, asset_type, timeframe, capital, commission, folds, split, code, is_public, profiles(username, display_name), backtest_runs(id, metrics_json, equity_curve, integrity, created_at)",
    )
    .eq("id", strategyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const strategy = data as unknown as SupabaseStrategy;
  const runs = (strategy.backtest_runs ?? []).slice().sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { strategy, run: runs[0] ?? null };
}

/** Convierte una estrategia + run de Supabase a un BacktestResult (para la vista de resultados). */
export function supabaseRunToResult(
  strategy: SupabaseStrategy,
  run: SupabaseRun,
): BacktestResult {
  const m = (run.metrics_json ?? {}) as unknown as BacktestResult["metrics"];
  return {
    id: run.id,
    config: {
      code: strategy.code,
      asset_type: strategy.asset_type as StrategyConfig["asset_type"],
      symbol: strategy.symbol,
      timeframe: strategy.timeframe as StrategyConfig["timeframe"],
      start: "",
      end: "",
      capital: Number(strategy.capital),
      commission: Number(strategy.commission),
      slippage: Number((strategy as { slippage?: number }).slippage ?? 0.0005),
      folds: strategy.folds,
      split: strategy.split,
    },
    created_at: run.created_at,
    metrics: m,
    integrity_label: (run.integrity as BacktestResult["integrity_label"]) ?? "Low",
    equity_curve: (run.equity_curve ?? []) as BacktestResult["equity_curve"],
  };
}
