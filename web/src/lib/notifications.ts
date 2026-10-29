/**
 * Cliente de notificaciones para QuantBattle.
 * Consume los endpoints `/notifications/...` del Worker FastAPI.
 */
import { call } from "@/lib/tournaments";

export interface Notification {
  id: string;
  user_id: string;
  type:
    | "submission_scored"
    | "tournament_closed"
    | "tournament_opened"
    | "badge_earned"
    | "referral_joined"
    | "qp_received"
    | "strategy_replicated";
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export async function listNotifications(
  unreadOnly = false,
  limit = 50,
): Promise<Notification[]> {
  const q = new URLSearchParams();
  if (unreadOnly) q.set("unread_only", "true");
  q.set("limit", String(limit));
  const res = await call<{ notifications?: Notification[] }>(
    `/notifications?${q.toString()}`,
  );
  return Array.isArray(res?.notifications) ? res.notifications : [];
}

export async function unreadCount(): Promise<number> {
  const res = await call<{ count?: number }>("/notifications/unread-count");
  return res?.count ?? 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await call("/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}
