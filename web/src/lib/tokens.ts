// Cliente de tokens QP — re-exporta tipos y funciones de tournaments.ts
// para mantener compatibilidad con páginas que importan de @/lib/tokens.

export { call } from "./tournaments";
export type {
  TokenBalance,
  TokenLedgerEntry,
  MarketplaceStrategy,
} from "./tournaments";

import { call } from "./tournaments";
import type { TokenBalance, TokenLedgerEntry, MarketplaceStrategy, Subscription } from "./tournaments";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export async function getBalance(): Promise<TokenBalance> {
  return call<TokenBalance>("/tokens/balance");
}

export async function getLedger(): Promise<TokenLedgerEntry[]> {
  return call<TokenLedgerEntry[]>("/tokens/ledger");
}

export async function purchaseQP(amount: number): Promise<{ balance: number }> {
  return call<{ balance: number }>("/tokens/transaction", {
    method: "POST",
    body: JSON.stringify({ amount, type: "purchase", memo: "Compra de QP" }),
  });
}

export async function spendQP(
  amount: number,
  type: string,
  refId?: string,
  memo?: string,
): Promise<{ balance: number }> {
  return call<{ balance: number }>("/tokens/transaction", {
    method: "POST",
    body: JSON.stringify({ amount: -Math.abs(amount), type, ref_id: refId, memo }),
  });
}

export async function earnQP(
  amount: number,
  type: string,
  refId?: string,
  memo?: string,
): Promise<{ balance: number }> {
  return call<{ balance: number }>("/tokens/transaction", {
    method: "POST",
    body: JSON.stringify({ amount: Math.abs(amount), type, ref_id: refId, memo }),
  });
}

// Reexporta la versión normalizada de tournaments.ts. Antes había una copia
// duplicada aquí que devolvía las filas crudas del worker (price_qp_week,
// profiles) y la UI leía price_qp/author -> undefined -> el filtro de precio
// escondía TODAS las estrategias publicadas.
export { getMarketplaceStrategies } from "./tournaments";

export async function getMarketplaceStrategy(id: string): Promise<MarketplaceStrategy> {
  return call<MarketplaceStrategy>(`/marketplace/${id}`);
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  return call<Subscription[]>(`/marketplace/my-subscriptions`);
}

export async function pauseSubscription(id: string): Promise<{ status: string }> {
  return call<{ status: string }>(`/marketplace/${id}/pause`, { method: "POST" });
}

export async function resumeSubscription(id: string): Promise<{ status: string }> {
  return call<{ status: string }>(`/marketplace/${id}/resume`, { method: "POST" });
}

export async function cancelSubscription(id: string): Promise<{ status: string }> {
  return call<{ status: string }>(`/marketplace/${id}/unsubscribe`, { method: "POST" });
}

export interface PublicProfile {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  country: string | null; bio: string | null; tier: string | null;
  strategies_count: number; tournaments_won: number; badges: string[];
  qp_balance: number; current_streak: number | null;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const supabase = createBrowserSupabaseClient();
  const [profile, strategies] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url, country, bio, total_qp_earned, tournaments_won, current_streak").eq("id", userId).maybeSingle(),
    supabase.from("strategies").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_public", true),
  ]);
  if (profile.error || strategies.error) throw new Error("No se pudo cargar el perfil público.");
  if (!profile.data) return null;
  return { ...profile.data, tier: null, strategies_count: strategies.count ?? 0, badges: [], qp_balance: Number(profile.data.total_qp_earned ?? 0) };

}

export type { Subscription } from "./tournaments";
