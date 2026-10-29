"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPublicProfile } from "@/lib/tokens";
import { getProfileTournamentHistory } from "@/lib/tournaments";
import {
  followUser,
  isFollowing,
  unfollowUser,
} from "@/lib/social";
import { getViewerId } from "@/lib/modelsHistory";
import { ModelsByStrategy } from "../components/ModelsByStrategy";
import { QPBadge } from "../components/QPBadge";
import { TierBadge } from "@/components/ui/TierBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCountUp } from "@/hooks/useCountUp";

const countryNames: Record<string, string> = {
  AR: "Argentina",
  BO: "Bolivia",
  BR: "Brasil",
  CL: "Chile",
  CO: "Colombia",
  CR: "Costa Rica",
  EC: "Ecuador",
  ES: "España",
  MX: "México",
  PE: "Perú",
  US: "Estados Unidos",
  VE: "Venezuela",
  UY: "Uruguay",
  PY: "Paraguay",
  PA: "Panamá",
};

function FlagEmoji({ country }: { country?: string | null }) {
  if (!country) return null;
  const codePoints = country
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return <span className="text-[16px]" aria-label={country}>{String.fromCodePoint(...codePoints)}</span>;
}

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getPublicProfile>> | null>(null);
  const [tournaments, setTournaments] = useState<Awaited<ReturnType<typeof getProfileTournamentHistory>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Social: botón Seguir / Dejar de seguir (oculto en el perfil propio).
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const vid = await getViewerId();
      if (!active) return;
      setViewerId(vid);
      if (!vid || vid === params.id) return;
      setFollowing(await isFollowing(vid, params.id));
    })();
    return () => {
      active = false;
    };
  }, [params.id]);

  const isOwnProfile = viewerId != null && viewerId === params.id;

  async function handleToggleFollow() {
    setFollowBusy(true);
    try {
      if (following) {
        await unfollowUser(params.id);
        setFollowing(false);
      } else {
        await followUser(params.id);
        setFollowing(true);
      }
    } catch {
      // Si falla, conservamos el estado previo sin romper la página.
    } finally {
      setFollowBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      getPublicProfile(params.id),
      getProfileTournamentHistory(params.id),
    ])
      .then(([p, t]) => {
        if (!active) return;
        setProfile(p);
        setTournaments(t);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Error al cargar perfil");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col">
        <section className="border-b border-line bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-10">
            <div className="flex flex-wrap items-start gap-6">
              <Skeleton variant="stat" className="!h-24 !w-24 !rounded-full" />
              <div className="flex-1 space-y-3 py-2">
                <Skeleton variant="line" className="max-w-[220px]" />
                <Skeleton variant="line" className="max-w-[320px]" />
              </div>
            </div>
          </div>
        </section>
        <section>
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-2">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        </section>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-sm text-muted">Este trader no existe o cambió de nombre.</p>
        <Link href="/app/rankings" className={buttonClasses("secondary", "sm")}>
          Volver al leaderboard
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
          <Link
            href="/app/rankings"
            className="metric text-[12px] text-muted hover:text-accent transition-colors"
          >
            ← Leaderboard
          </Link>
        </div>
      </section>

      {/* Header del perfil */}
      <section className="border-b border-line bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="flex flex-wrap items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="h-24 w-24 rounded-full border-2 border-line object-cover"
                />
              ) : (
                <span
                  className="flex h-24 w-24 items-center justify-center rounded-full metric text-[28px] font-semibold text-[#0a0c10]"
                  style={{ background: "linear-gradient(135deg, #5eead4 0%, #38bdf8 100%)" }}
                >
                  {(profile.display_name ?? profile.username ?? "??").slice(0, 1).toUpperCase()}
                </span>
              )}
              {profile.tier && (
                <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-accent border-2 border-bg flex items-center justify-center">
                  <span className="text-[8px]">◆</span>
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">
                  @{profile.username}
                </h1>
                <TierBadge tier={profile.tier} />
              </div>

              {profile.display_name && (
                <p className="text-sm text-muted mt-0.5">{profile.display_name}</p>
              )}

              {profile.bio && (
                <p className="mt-3 text-sm leading-relaxed text-muted max-w-2xl">
                  {profile.bio}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 flex-wrap">
                {profile.country && (
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <FlagEmoji country={profile.country} />
                    {countryNames[profile.country] ?? profile.country}
                  </span>
                )}
                <span className="metric text-sm text-muted">
                  {profile.strategies_count} estrategias públicas
                </span>
                <span className="metric text-sm text-muted">
                  {profile.tournaments_won} torneos ganados
                </span>
              </div>

              {/* Badges */}
              {profile.badges.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.badges.map((b: string) => (
                    <Badge key={b} tone="cyan" mono>
                      {b}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* QP Badge + seguir + compartir */}
            <div className="flex flex-col items-end gap-3">
              <QPBadge amount={profile.qp_balance} size="lg" />
              {viewerId != null && !isOwnProfile && (
                <button
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  className={buttonClasses(following ? "secondary" : "primary", "sm")}
                >
                  {following ? "Dejar de seguir" : "Seguir"}
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href).catch(() => {});
                }}
                className="qb-glass-hover flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5">
                  <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" strokeLinecap="round" />
                  <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" strokeLinecap="round" />
                </svg>
                Compartir
              </button>
            </div>
          </div>

          {/* Stats row con count-up */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="QP totales" value={profile.qp_balance ?? null} tone="accent" />
            <StatTile label="Torneos" value={tournaments?.length ?? null} />
            <StatTile
              label="Mejor rank"
              value={
                tournaments && tournaments.some((t) => t.placed != null)
                  ? Math.min(...tournaments.filter((t) => t.placed != null).map((t) => t.placed!))
                  : null
              }
              prefix="#"
            />
            <StatTile label="Racha actual" value={profile.current_streak ?? null} suffix="🔥" />
          </div>
        </div>
      </section>

      {/* Contenido del perfil */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 pt-10">
          {/* Mis modelos: una fila por estrategia enviada a torneos, con historial de rounds */}
          <ModelsByStrategy userId={params.id} />
        </div>
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-2">
          {/* Estrategias publicadas */}
          <div>
            <h2 className="text-lg font-semibold text-ink mb-4">
              Estrategias publicadas
            </h2>
            <div className="qb-glass qb-elev-1 rounded-xl px-6 py-10 text-center">
              <p className="text-sm text-muted">
                {profile.strategies_count > 0
                  ? `${profile.strategies_count} estrategias públicas`
                  : "Sin estrategias públicas todavía."}
              </p>
            </div>
          </div>

          {/* Historial de torneos */}
          <div>
            <h2 className="text-lg font-semibold text-ink mb-4">
              Historial de torneos
            </h2>
            {tournaments && tournaments.length > 0 ? (
              <div className="qb-glass overflow-hidden rounded-xl">
                <ul className="divide-y divide-line max-h-[400px] overflow-y-auto">
                  {tournaments.map((t) => (
                    <li key={t.id} className="qb-row flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-ink truncate">
                          {t.name}
                        </p>
                        <p className="metric text-[11px] text-muted">
                          {new Date(t.joined_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      {t.placed != null && (
                        <Badge
                          tone={t.placed <= 3 ? "long" : "neutral"}
                          mono
                        >
                          #{t.placed}
                        </Badge>
                      )}
                      <span className="metric text-[12px] text-accent">
                        {t.qp_prize.toLocaleString()} QP
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="qb-glass qb-elev-1 rounded-xl px-6 py-10 text-center">
                <p className="text-sm text-muted">
                  Sin participaciones en torneos.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function StatTile({
  label,
  value,
  prefix = "",
  suffix = "",
  tone,
}: {
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  tone?: "accent";
}) {
  const animated = useCountUp(value ?? 0);
  const display =
    value == null ? (
      "—"
    ) : (
      <>
        {prefix}
        {animated.toLocaleString("es-CO")}
        {suffix && <span className="ml-1 text-sm">{suffix}</span>}
      </>
    );
  return (
    <div className="qb-glass qb-elev-1 rounded-xl px-4 py-4 text-center">
      <div className="metric text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`metric mt-1.5 text-2xl font-semibold ${
          tone === "accent" ? "text-accent" : value != null ? "text-ink" : "text-muted"
        }`}
      >
        {display}
      </div>
    </div>
  );
}