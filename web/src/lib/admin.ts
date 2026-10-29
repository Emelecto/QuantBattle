/**
 * Cliente de admin para QuantBattle.
 * Consume los endpoints `/admin/...` del Worker Fastapi.
 */
import { call } from "@/lib/tournaments";

export interface AdminStats {
  users: {
    total: number;
    wau: number;
    mau: number;
    new_this_week: number;
  };
  tournaments: {
    total: number;
    open: number;
  };
  submissions: {
    total: number;
    this_week: number;
  };
  qp: {
    circulation: number;
    emitted: number;
  };
  referrals: number;
  badges: number;
}

export interface AdminAlert {
  type: string;
  severity: "warning" | "error" | "info";
  title: string;
  message: string;
  link: string | null;
}

export interface AdminActivity {
  new_users: Array<{
    id: string;
    username: string;
    created_at: string;
  }>;
  recent_submissions: Array<{
    id: string;
    tournament_id: string;
    user_id: string;
    status: string;
    submitted_at: string;
  }>;
  recent_badges: Array<{
    user_id: string;
    badge_type: string;
    earned_at: string;
  }>;
  recent_referrals: Array<{
    referrer_id: string;
    referred_id: string;
    status: string;
    created_at: string;
  }>;
}

export async function getAdminStats(): Promise<AdminStats> {
  return call<AdminStats>("/admin/stats");
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const res = await call<{ alerts: AdminAlert[] }>("/admin/alerts");
  return res.alerts;
}

export async function getAdminActivity(): Promise<AdminActivity> {
  return call<AdminActivity>("/admin/activity");
}
