"use client";

import { useState, useEffect, useCallback } from "react";
import { getMyReferralCode, getReferralStats } from "@/lib/referrals";

interface Stats {
  total_referidos: number;
  rewarded: number;
  qp_earned: number;
  reward_per_referral: number;
}

export default function ReferralsPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => Promise.all([getMyReferralCode(), getReferralStats()])
    .then(([c, s]) => { setCode(c); setStats(s); })
    .catch((e: unknown) => { console.error(e); }).finally(() => setLoading(false)), []);

  useEffect(() => {
    load();
  }, [load]);

  const referralLink = code ? `${window.location.origin}/register?ref=${code}` : "";

  const copyToClipboard = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="text-muted text-sm">Cargando...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-ink">Referidos</h2>
        <p className="text-sm text-muted mt-1">
          Invita amigos y gana {stats?.reward_per_referral ?? 5} QP por cada uno que se registre.
        </p>
      </div>

      {/* Link de referido */}
      <div className="ql-glass ql-elev-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ink mb-3">Tu enlace de referido</h3>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={referralLink || "Generando..."}
            className="flex-1 rounded-md border border-line bg-surface/50 px-3 py-2 text-sm text-muted font-mono"
          />
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!code}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          Comparte este enlace. Cuando alguien se registre con tu código, ambos reciben QP.
        </p>
      </div>

      {/* Estadísticas */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="ql-glass ql-elev-1 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Referidos</p>
          <p className="metric text-2xl font-bold text-accent mt-1">
            {stats?.total_referidos ?? 0}
          </p>
        </div>
        <div className="ql-glass ql-elev-1 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Recompensados</p>
          <p className="metric text-2xl font-bold text-long mt-1">
            {stats?.rewarded ?? 0}
          </p>
        </div>
        <div className="ql-glass ql-elev-1 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted">QP Ganado</p>
          <p className="metric text-2xl font-bold text-accent mt-1">
            {stats?.qp_earned ?? 0}
          </p>
        </div>
      </div>

      {/* Cómo funciona */}
      <div className="ql-glass ql-elev-1 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ink mb-3">¿Cómo funciona?</h3>
        <ol className="text-sm text-muted space-y-2">
          <li className="flex gap-2">
            <span className="metric font-bold text-accent">1.</span>
            Comparte tu enlace de referido con amigos
          </li>
          <li className="flex gap-2">
            <span className="metric font-bold text-accent">2.</span>
            Ellos se registran usando tu código
          </li>
          <li className="flex gap-2">
            <span className="metric font-bold text-accent">3.</span>
            Ambos reciben {stats?.reward_per_referral ?? 5} QP automáticamente
          </li>
        </ol>
      </div>
    </div>
  );
}
