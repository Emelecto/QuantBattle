/**
 * Cliente de referidos para QuantBattle.
 * Consume los endpoints `/referrals/...` del Worker FastAPI.
 */
import { call } from "@/lib/tournaments";

export interface ReferralStats {
  total_referidos: number;
  rewarded: number;
  qp_earned: number;
  reward_per_referral: number;
}

export async function getMyReferralCode(): Promise<string> {
  const res = await call<{ code: string }>("/referrals/code");
  return res.code;
}

export async function validateReferralCode(
  code: string,
): Promise<{ valid: boolean; referrer_id?: string; error?: string }> {
  const res = await call<{ valid: boolean; referrer_id?: string; error?: string }>(
    `/referrals/validate?code=${encodeURIComponent(code)}`,
  );
  return res;
}

export async function trackReferral(code: string): Promise<{ ok: boolean; reward_qp: number }> {
  return call<{ ok: boolean; reward_qp: number }>("/referrals/track", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getReferralStats(): Promise<ReferralStats> {
  return call<ReferralStats>("/referrals/stats");
}
