/**
 * Cliente de comentarios de estrategias del marketplace para QuantBattle.
 * Fuente: Worker FastAPI (NEXT_PUBLIC_WORKER_URL).
 *
 * Endpoints (worker):
 * - GET    /marketplace/{strategy_id}/comments?limit=50 → StrategyComment[] ASC
 * - POST   /marketplace/{strategy_id}/comments          { body }
 * - DELETE /comments/{comment_id}
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface StrategyComment {
  id: string;
  author_id: string;
  username: string;
  body: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8001";

/** Mismo patrón que tournaments.ts: fetch al worker con Bearer del session. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabase();
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

function getSupabase() {
  return createBrowserSupabaseClient();
}

/* ------------------------------------------------------------------ */
/* Comentarios                                                         */
/* ------------------------------------------------------------------ */

/** Comentarios de una estrategia, en orden ascendente (más antiguo primero). */
export async function listStrategyComments(
  strategyId: string,
  limit = 50,
): Promise<StrategyComment[]> {
  const list = await call<StrategyComment[]>(
    `/marketplace/${strategyId}/comments?limit=${limit}`,
  );
  return Array.isArray(list) ? list : [];
}

/** Publica un comentario. Devuelve el comentario creado. */
export async function createStrategyComment(
  strategyId: string,
  body: string,
): Promise<StrategyComment> {
  return call<StrategyComment>(`/marketplace/${strategyId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** Elimina un comentario propio. */
export async function deleteStrategyComment(commentId: string): Promise<void> {
  await call<void>(`/comments/${commentId}`, { method: "DELETE" });
}

/** Reporta contenido (comentario o estrategia) a moderación. */
export async function reportContent(
  targetType: "comment" | "marketplace_strategy",
  targetId: string,
  reason: string,
): Promise<{ id?: string; status?: string }> {
  return call<{ id?: string; status?: string }>(`/moderation/report`, {
    method: "POST",
    body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
  });
}
