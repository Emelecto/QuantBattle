/**
 * Rankings de QuantBattle — QP y Torneos, con filtro temporal.
 *
 * Filtros: "week" | "month" | "3months"
 * El ranking por QP suma el token_ledger en el período.
 * El ranking por torneos cuenta participaciones/resultados en el período.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type RankingPeriod = "week" | "month" | "3months";

export type QPRankingEntry = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  country?: string | null;
  qp: number;
  is_me?: boolean;
};

export type TournamentRankingEntry = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  country?: string | null;
  tournaments_won: number;
  tournaments_entered: number;
  is_me?: boolean;
};

function periodToISO(period: RankingPeriod): string {
  const now = new Date();
  const d = new Date();
  if (period === "week") d.setDate(now.getDate() - 7);
  else if (period === "month") d.setMonth(now.getMonth() - 1);
  else d.setMonth(now.getMonth() - 3);
  return d.toISOString();
}

/**
 * Ranking por QP ganado en un período (token_ledger con amount > 0).
 * Devuelve top 10 + posición del usuario actual si no está en el top 10.
 */
export async function getQPRanking(
  period: RankingPeriod = "month",
): Promise<{ entries: QPRankingEntry[]; my_rank: QPRankingEntry | null }> {
  const supabase = createBrowserSupabaseClient();
  const since = periodToISO(period);

  // Obtener usuario actual
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id;

  // Sumar QP por usuario en el período
  const { data: rows, error } = await supabase
    .from("token_ledger")
    .select("user_id, amount")
    .gt("amount", 0)
    .gte("created_at", since);

  if (error) throw new Error("No se pudo consultar la actividad QP.");
  if (!rows) return { entries: [], my_rank: null };

  // Agregar QP por usuario
  const qpMap = new Map<string, number>();
  for (const r of rows as { user_id: string; amount: number }[]) {
    qpMap.set(r.user_id, (qpMap.get(r.user_id) ?? 0) + r.amount);
  }

  // Obtener perfiles para usernames
  const userIds = Array.from(qpMap.keys());
  if (userIds.length === 0) return { entries: [], my_rank: null };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, country")
    .in("id", userIds);
  if (profileError) throw new Error("No se pudieron consultar los perfiles del ranking.");

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; username: string; avatar_url?: string | null; country?: string | null }) => [p.id, p]),
  );

  // Construir entries y ordenar
  const allEntries: QPRankingEntry[] = userIds
    .map((uid) => {
      const p = profileMap.get(uid);
      return {
        rank: 0,
        user_id: uid,
        username: p?.username ?? "trader",
        avatar_url: p?.avatar_url ?? null,
        country: p?.country ?? null,
        qp: qpMap.get(uid) ?? 0,
        is_me: uid === myId,
      };
    })
    .sort((a, b) => b.qp - a.qp);

  // Asignar ranks
  allEntries.forEach((e, i) => (e.rank = i + 1));

  const top10 = allEntries.slice(0, 10);
  const myEntry = allEntries.find((e) => e.is_me) ?? null;

  // Si el usuario no está en top 10, añadirlo al final
  if (myEntry && myEntry.rank > 10) {
    return { entries: [...top10, myEntry], my_rank: myEntry };
  }

  return { entries: top10, my_rank: myEntry };
}

/**
 * Ranking por torneos ganados en un período.
 * Usa tournaments_won de profiles (acumulado) como métrica principal,
 * y tournament_participants para contar participaciones en el período.
 */
export async function getTournamentRanking(
  period: RankingPeriod = "month",
): Promise<{ entries: TournamentRankingEntry[]; my_rank: TournamentRankingEntry | null }> {
  const supabase = createBrowserSupabaseClient();
  const since = periodToISO(period);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user?.id;

  // Obtener perfiles con tournaments_won > 0
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, country, tournaments_won")
    .gt("tournaments_won", 0)
    .order("tournaments_won", { ascending: false })
    .limit(50);

  if (error) throw new Error("No se pudo consultar el ranking de torneos.");
  if (!profiles) return { entries: [], my_rank: null };

  // Cuantos torneos participa cada usuario en el período
  const { data: participations, error: participationError } = await supabase
    .from("tournament_participants")
    .select("user_id, tournament_id")
    .gte("joined_at", since);
  if (participationError) throw new Error("No se pudieron consultar las participaciones.");

  const enteredMap = new Map<string, Set<string>>();
  for (const p of (participations ?? []) as { user_id: string; tournament_id: string }[]) {
    if (!enteredMap.has(p.user_id)) enteredMap.set(p.user_id, new Set());
    enteredMap.get(p.user_id)!.add(p.tournament_id);
  }

  const allEntries: TournamentRankingEntry[] = (
    profiles as {
      id: string;
      username: string;
      avatar_url?: string | null;
      country?: string | null;
      tournaments_won: number;
    }[]
  ).map((p) => ({
    rank: 0,
    user_id: p.id,
    username: p.username ?? "trader",
    avatar_url: p.avatar_url ?? null,
    country: p.country ?? null,
    tournaments_won: p.tournaments_won ?? 0,
    tournaments_entered: enteredMap.get(p.id)?.size ?? 0,
    is_me: p.id === myId,
  }));

  // Ordenar por tournaments_won, luego por participaciones
  allEntries.sort((a, b) => {
    if (b.tournaments_won !== a.tournaments_won) return b.tournaments_won - a.tournaments_won;
    return b.tournaments_entered - a.tournaments_entered;
  });

  allEntries.forEach((e, i) => (e.rank = i + 1));

  const top10 = allEntries.slice(0, 10);
  const myEntry = allEntries.find((e) => e.is_me) ?? null;

  if (myEntry && myEntry.rank > 10) {
    return { entries: [...top10, myEntry], my_rank: myEntry };
  }

  return { entries: top10, my_rank: myEntry };
}
