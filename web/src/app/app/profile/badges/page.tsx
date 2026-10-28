"use client";

import { useState, useEffect, useCallback } from "react";
import { call } from "@/lib/tournaments";

interface Badge {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
  metadata: Record<string, unknown>;
}

interface BadgeDefinition {
  title: string;
  description: string;
  icon: string;
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [available, setAvailable] = useState<Record<string, BadgeDefinition>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => Promise.all([call<{ badges?: Badge[] }>("/badges"), call<{ badges?: Record<string, BadgeDefinition> }>("/badges/available")])
    .then(([b, a]) => { setBadges(b?.badges || []); setAvailable(a?.badges || {}); })
    .catch((e: unknown) => { console.error(e); }).finally(() => setLoading(false)), []);

  useEffect(() => {
    load();
  }, [load]);

  const earnedTypes = new Set(badges.map((b) => b.type));

  if (loading) {
    return <div className="text-muted text-sm">Cargando...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-ink">Logros</h2>
        <p className="text-sm text-muted mt-1">
          Desbloquea badges participando en torneos, invitando amigos y más.
        </p>
      </div>

      {/* Badges ganados */}
      {badges.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">
            Tus badges ({badges.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className="ql-glass ql-elev-1 rounded-xl p-4 flex items-start gap-3"
              >
                <span className="text-2xl">{badge.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-ink">{badge.title}</p>
                  <p className="text-xs text-muted mt-0.5">{badge.description}</p>
                  <p className="text-[10px] text-muted mt-1">
                    {new Date(badge.earned_at).toLocaleDateString("es", {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badges disponibles */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">Todos los badges</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(available).map(([type, def]) => {
            const earned = earnedTypes.has(type);
            return (
              <div
                key={type}
                className={`ql-glass ql-elev-1 rounded-xl p-4 flex items-start gap-3 transition-opacity ${
                  earned ? "opacity-100" : "opacity-40"
                }`}
              >
                <span className="text-2xl">{def.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {def.title}
                    {earned && (
                      <span className="ml-2 text-xs text-long">✓</span>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{def.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
