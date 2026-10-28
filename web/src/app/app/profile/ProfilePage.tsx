"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { getBalance } from "@/lib/tokens";
import { LESSONS } from "@/lib/academia/catalog";
import { useAcademiaProgress } from "@/components/academia/progress-store";
import { TIER } from "@/lib/constants";
import { TierBadge } from "@/components/ui/TierBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { inputClasses } from "@/components/ui/Form";
import { Skeleton } from "@/components/ui/Skeleton";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type BalanceData = {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  tier: "free" | "plus" | "pro" | "legend";
  updated_at: string;
};

type ProfileData = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  username_updated_at: string | null;
};

function StatTile({
  label,
  value,
  prefix = "",
  suffix = "",
  tone,
}: {
  label: string;
  value: string | number | null;
  prefix?: string;
  suffix?: string;
  tone?: "accent" | "long" | "short";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "long"
        ? "text-long"
        : tone === "short"
          ? "text-short"
          : "text-ink";
  return (
    <div className="ql-glass ql-elev-1 rounded-xl px-4 py-4 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold ${toneClass}`}>
        {value == null || value === "--" ? (
          "--"
        ) : (
          <>
            {prefix}
            {typeof value === "number" ? value.toLocaleString("es-CO") : value}
            {suffix && <span className="ml-1 text-sm">{suffix}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  return <ProfileContent key={auth.user?.id ?? "guest"} {...auth} />;
}

function ProfileContent({ user, loading: authLoading }: ReturnType<typeof useAuth>) {
  // Progreso de Academia (store local multi-curso C1–C6; el panel del quiz
  // lo sincroniza a Supabase en completed_lessons + QP vía earnQP).
  const academiaDone = useAcademiaProgress().completed;
  const [tournamentsEntered, setTournamentsEntered] = useState<number | null>(null);
  // Torneos entrados: conteo real en Supabase (tabla submissions).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const [legacy, predictions] = await Promise.all([
          supabase.from("submissions").select("tournament_id").eq("user_id", user.id),
          supabase.from("prediction_submissions").select("dataset_id, ml_datasets(tournament_id)").eq("user_id", user.id).eq("is_selected", true),
        ]);
        if (legacy.error) throw legacy.error;
        if (predictions.error) throw predictions.error;
        const entered = new Set((legacy.data ?? []).map((row) => row.tournament_id));
        for (const row of predictions.data ?? []) {
          const dataset = Array.isArray(row.ml_datasets) ? row.ml_datasets[0] : row.ml_datasets;
          if (dataset?.tournament_id) entered.add(dataset.tournament_id);
        }
        if (active) setTournamentsEntered(entered.size);
      } catch {
        if (active) setTournamentsEntered(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [, setProfileLoading] = useState(false);

  // Estado para cambio de username
  const [usernameEdit, setUsernameEdit] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  // Ref para el input de archivo del avatar (DEBE declararse antes de cualquier
  // early return; si no, React lanza error #310 "más hooks de los esperados").
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getBalance()
      .then(setBalance)
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false));
  }, [user]);

  // Cargar perfil (username + display_name + avatar_url). username_updated_at
  // es opcional: la migración 0020 puede no estar aplicada aún en prod, así que
  // no dependemos de esa columna para no romper la query.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadProfile = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (error) {
          // No es crítico: no cargamos el username, la UI sigue funcionando.
          setProfile((p) => p ?? { username: null, display_name: null, avatar_url: null, username_updated_at: null });
        } else if (data) {
          setProfile({
            username: data.username ?? null,
            display_name: data.display_name ?? null,
            avatar_url: data.avatar_url ?? null,
            username_updated_at: null,
          });
          setUsernameInput(data.username ?? "");
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setProfileLoading(false);
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [user]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen flex-col">
        <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
          <div className="ql-skeleton-line w-48 h-8" />
          <div className="ql-skeleton-line w-72 h-4 mt-2" />
          <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="ql-skeleton-card rounded-xl p-5 space-y-3">
                <div className="ql-skeleton-line w-20" />
                <div className="ql-skeleton-line w-32 h-8 mt-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-muted">No has iniciado sesion.</p>
        <Link href="/login" className={buttonClasses("primary", "md")}>
          Iniciar sesion
        </Link>
      </main>
    );
  }

  const displayName =
    profile?.display_name ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null) ||
    user?.email?.split("@")[0] ||
    "Trader";

  const username = profile?.username ?? "";

  const tier = balance?.tier || "free";
  const tierInfo = TIER[tier as keyof typeof TIER] || TIER.free;

  const completedModules = new Set(academiaDone.filter((id) => LESSONS.some((lesson) => lesson.id === id && !lesson.draft))).size;
  const totalModules = LESSONS.filter((l) => !l.draft).length;
  const coursePercent =
    totalModules > 0
      ? Math.round((completedModules / totalModules) * 100)
      : 0;

  // --- Handlers: avatar upload ---
  const handleAvatarClick = () => {
    // Hover/inline edit: abrir selector de archivo
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setProfileLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const fileName = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type,
        });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id);
      if (updateErr) throw updateErr;
      // Refrescar perfil
      setProfile((p) => (p ? { ...p, avatar_url: urlData.publicUrl } : p));
      setUsernameSuccess("Foto de perfil actualizada correctamente.");
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : "Error al subir la foto.");
    } finally {
      setProfileLoading(false);
      e.target.value = "";
    }
  };

  // --- Handlers: change username ---
  const handleUsernameSave = async () => {
    const newUsername = usernameInput.trim();
    if (newUsername.length < 3 || newUsername.length > 20) {
      setUsernameError("El nombre de usuario debe tener entre 3 y 20 caracteres.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(newUsername)) {
      setUsernameError("Solo letras, números, guiones y puntos.");
      return;
    }
    if (newUsername === username) {
      setUsernameEdit(false);
      setUsernameError(null);
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase
        .from("profiles")
        .update({ username: newUsername })
        .eq("id", user.id);
      if (error) {
        setUsernameError(error.message);
      } else {
        setProfile((p) =>
          p ? { ...p, username: newUsername, username_updated_at: new Date().toISOString() } : p,
        );
        setUsernameSuccess("Username actualizado.");
        setUsernameEdit(false);
      }
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : "Error al actualizar el username.");
    } finally {
      setUsernameSaving(false);
    }
  };

  // --- Cooldown check ---
  function getCooldownInfo(): { blocked: boolean; daysLeft: number } {
    if (!profile?.username_updated_at) return { blocked: false, daysLeft: 0 };
    const last = new Date(profile.username_updated_at);
    const now = new Date();
    const elapsedMs = now.getTime() - last.getTime();
    const cooldownMs = 7 * 24 * 60 * 60 * 1000;
    if (elapsedMs >= cooldownMs) return { blocked: false, daysLeft: 0 };
    const remainingMs = cooldownMs - elapsedMs;
    return { blocked: true, daysLeft: Math.ceil(remainingMs / (1000 * 60 * 60 * 24)) };
  }

  const cd = getCooldownInfo();

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 animate-fadeIn">
          {/* Avatar con hover → editar */}
          <div
            className="relative group"
            title="Cambiar foto de perfil"
            onClick={handleAvatarClick}
          >
            <Avatar src={profile?.avatar_url} name={displayName} size={80} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 5h8M14 8l3-3 3 3M6 11h12M6 15h12M6 19h12" />
              </svg>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Username con opcion de editar */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {displayName}
              </h1>
              <TierBadge tier={tier} />
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {usernameEdit ? (
                <>
                  <input
                    className={inputClasses + " w-44"}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    maxLength={20}
                    minLength={3}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUsernameSave();
                      if (e.key === "Escape") {
                        setUsernameInput(username);
                        setUsernameEdit(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={usernameSaving || cd.blocked}
                    onClick={handleUsernameSave}
                    className="text-xs font-medium text-accent hover:text-accent/80 disabled:opacity-50"
                  >
                    {usernameSaving ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="8" /><line x1="12" y1="8" x2="16" y2="8" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameInput(username);
                      setUsernameEdit(false);
                      setUsernameError(null);
                    }}
                    className="text-xs font-medium text-muted hover:text-ink"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted">@{username}</span>
                  {!cd.blocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameError(null);
                        setUsernameSuccess(null);
                        setUsernameEdit(true);
                      }}
                      className="text-xs font-medium text-muted hover:text-ink underline underline-offset-2"
                    >
                      Editar
                    </button>
                  )}
                  {cd.blocked && (
                    <span className="text-xs text-short">
                      Bloqueado por 7 días ({cd.daysLeft}d)
                    </span>
                  )}
                </>
              )}
              {usernameError && (
                <p role="alert" className="text-xs text-short col-span-2">
                  {usernameError}
                </p>
              )}
              {usernameSuccess && (
                <p className="text-xs text-long col-span-2">
                  {usernameSuccess}
                </p>
              )}
            </div>

            <p className="text-sm text-muted mt-0.5">{user.email}</p>
          </div>

          <Link
            href="/app/profile/settings"
            className={buttonClasses("secondary", "md")}
          >
            Configuracion
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-8 grid gap-4 grid-cols-2 sm:grid-cols-4 animate-fadeIn">
          <StatTile
            label="QP disponibles"
            value={balance?.balance ?? "--"}
            tone="accent"
          />
          <StatTile
            label="Torneos entrados"
            value={tournamentsEntered}
          />
          <StatTile
            label="Win rate"
            value="--"
            suffix="%"
          />
          <StatTile
            label="Mejor ranking"
            value="--"
            prefix="#"
          />
        </div>

        {/* Main content grid */}
        <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-3 animate-fadeIn">
          {/* Suscripcion */}
          <Card className="lg:col-span-1">
            <CardBody className="p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">
                Suscripcion
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    Plan actual
                  </p>
                  <p className="text-lg font-semibold text-ink mt-0.5">
                    {tierInfo.label}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    QP disponibles
                  </p>
                  <p className="metric text-accent ql-glow-text text-2xl font-semibold mt-0.5">
                    {balanceLoading ? (
                      <Skeleton variant="line" className="w-24 h-8" />
                    ) : (
                      `${(balance?.balance ?? 0).toLocaleString("es-CO")} QP`
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    Proxima renovacion
                  </p>
                  <p className="text-sm text-ink mt-0.5">--</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Seguridad */}
          <Card className="lg:col-span-1">
            <CardBody className="p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">
                Seguridad
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    Contrasena
                  </p>
                  <p className="text-sm text-ink mt-0.5">••••••••</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    Autenticación en dos pasos
                  </p>
                  <p className="text-sm text-muted mt-0.5">No gestionada desde este prototipo</p>
                </div>
                <Link
                  href="/app/profile/settings#security"
                  className={buttonClasses("secondary", "sm")}
                >
                  Cambiar contrasena
                </Link>
              </div>
            </CardBody>
          </Card>

          {/* Progreso en Academia */}
          <Card className="lg:col-span-1">
            <CardBody className="p-6">
              <h2 className="text-sm font-semibold text-ink mb-4">
                Progreso en Academia
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    Lecciones completadas
                  </p>
                  <p className="text-sm text-ink mt-0.5">
                    {completedModules} de {totalModules}
                  </p>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${coursePercent}%` }}
                  />
                </div>
                <p className="metric text-xs text-muted">{coursePercent}% completado</p>
                {totalModules > 0 && completedModules >= totalModules && (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      Academia completada: 6 cursos
                    </span>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </main>
  );
}