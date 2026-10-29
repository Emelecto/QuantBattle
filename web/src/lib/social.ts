/**
 * Cliente social de QuantBattle: follows y feed de actividad.
 * Fuente: Worker FastAPI (NEXT_PUBLIC_WORKER_URL).
 *
 * Endpoints (worker):
 * - POST   /social/{user_id}/follow  → seguir (auth)
 * - DELETE /social/{user_id}/follow  → dejar de seguir (auth)
 * - GET    /social/feed?limit=30     → actividad de seguidos + propia (auth)
 * - GET    /social/activity?limit=30 → actividad global (público)
 *
 * El estado "¿lo sigo?" se consulta directo a Supabase: la tabla follows
 * tiene SELECT público por RLS, y así evitamos un endpoint extra.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type ActivityAction =
  | "published_strategy"
  | "tournament_submission"
  | "comment_added";

export interface ActivityEvent {
  id: number;
  actor_id: string;
  username: string | null;
  action: ActivityAction;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8001";

/** Mismo patrón que comments.ts: fetch al worker con Bearer del session. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${WORKER}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

/* ------------------------------------------------------------------ */
/* Follows                                                             */
/* ------------------------------------------------------------------ */

/** Sigue a un usuario autenticado. */
export async function followUser(userId: string): Promise<void> {
  await call(`/social/${userId}/follow`, { method: "POST" });
}

/** Deja de seguir a un usuario. */
export async function unfollowUser(userId: string): Promise<void> {
  await call(`/social/${userId}/follow`, { method: "DELETE" });
}

/** ¿El viewer sigue a userId? Requiere sesión del viewer. */
export async function isFollowing(
  viewerId: string,
  userId: string,
): Promise<boolean> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", viewerId)
      .eq("followed_id", userId)
      .maybeSingle();
    return data != null;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Actividad                                                           */
/* ------------------------------------------------------------------ */

/** Feed de actividad de los usuarios que sigo + la mía propia (auth). */
export async function getActivityFeed(limit = 30): Promise<ActivityEvent[]> {
  const list = await call<ActivityEvent[]>(`/social/feed?limit=${limit}`);
  return Array.isArray(list) ? list : [];
}

/** Últimos eventos globales de la plataforma (público). */
export async function getGlobalActivity(limit = 30): Promise<ActivityEvent[]> {
  const list = await call<ActivityEvent[]>(`/social/activity?limit=${limit}`);
  return Array.isArray(list) ? list : [];
}
