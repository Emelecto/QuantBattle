"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { call } from "@/lib/tournaments";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ApiKeyRow = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type TabKey = "notifications" | "api" | "security" | "danger";

const TABS: { key: TabKey; label: string }[] = [
  { key: "notifications", label: "Notificaciones" },
  { key: "api", label: "Conexiones / API" },
  { key: "security", label: "Seguridad" },
  { key: "danger", label: "Zona de peligro" },
];

export function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState<TabKey>("notifications");

  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  useEffect(() => {
    const updateTab = () => { if (window.location.hash === "#security") setTab("security"); };
    updateTab();
    window.addEventListener("hashchange", updateTab);
    return () => window.removeEventListener("hashchange", updateTab);
  }, []);
  // API Keys
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Danger
  const [signingOutAll, setSigningOutAll] = useState(false);

  const loadKeys = useCallback(async () => {
    if (!user) return;
    setKeysLoading(true);
    setError(null);
    try {
      setKeys(await call<ApiKeyRow[]>("/account/api-keys"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las claves.");
    } finally {
      setKeysLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === "api") loadKeys();
  }, [tab, loadKeys]);

  const handleRegenerate = useCallback(async () => {
    if (!user) return;
    setRegenerating(true);
    setError(null);
    try {
      const json = await call<{key: string}>("/account/api-keys", {method: "POST", body: JSON.stringify({name: "Clave de perfil"})});
      setApiKey(json.key);
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la clave.");
    } finally {
      setRegenerating(false);
    }
  }, [user, loadKeys]);

  const handleSignOutAll = useCallback(async () => {
    setSigningOutAll(true);
    try {
      await signOut();
      window.location.href = "/login";
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la sesión.");
      setSigningOutAll(false);
    }
  }, [signOut]);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPasswordSaved(false);
    if (password.length < 8) { setError("Usa al menos 8 caracteres."); return; }
    if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setSavingPassword(true);
    try {
      const {error: updateError} = await createBrowserSupabaseClient().auth.updateUser({password});
      if (updateError) throw updateError;
      setPassword(""); setConfirmation(""); setPasswordSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar la contraseña."); }
    finally { setSavingPassword(false); }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen flex-col">
        <div className="ql-page flex-1">
          <div className="ql-skeleton-line w-48 h-8" />
          <div className="ql-skeleton-line w-72 h-4 mt-2" />
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

  return (
    <main className="flex min-h-screen flex-col">
      <div className="ql-page flex-1">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 animate-fadeIn">
          <Link
            href="/app/profile"
            className="metric text-sm text-muted hover:text-accent transition-colors"
          >
            ← Perfil
          </Link>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink animate-fadeIn">
          Configuracion
        </h1>
        <p className="mt-2 text-sm text-muted animate-fadeIn">
          Gestiona tu cuenta, notificaciones y conexiones.
        </p>

        {error && <p role="alert" className="mt-6 break-words text-sm text-short">{error}</p>}
        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-1 border-b border-line animate-fadeIn">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setError(null); }}
              aria-pressed={tab === t.key}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-8 animate-fadeIn">
          {tab === "notifications" && (
            <Card>
              <CardBody className="p-6">
                <h2 className="text-sm font-semibold text-ink mb-4">
                  Preferencias de notificacion
                </h2>
                <p className="text-sm leading-relaxed text-muted">Los avisos de actividad aparecen en el menú de notificaciones cuando hay mensajes pendientes. La configuración de canales y los correos automáticos todavía no están disponibles.</p>
              </CardBody>
            </Card>
          )}

          {tab === "api" && (
            <div className="space-y-6">
              {/* API Key */}
              <Card>
                <CardBody className="p-6">
                  <h2 className="text-sm font-semibold text-ink mb-4">
                    Clave de API
                  </h2>
                  <p className="text-sm text-muted mb-4">
                    Usa esta clave para conectar agentes de IA y herramientas
                    externas a QuantLab. No la compartas publicamente.
                  </p>
                  {apiKey ? (
                    <div className="rounded-lg border border-accent/40 bg-accent/[0.07] p-4">
                      <p className="text-sm font-medium text-accent mb-2">
                        Clave recien generada — copiala ahora
                      </p>
                      <code className="block overflow-x-auto rounded-md border border-line bg-surface-solid px-3 py-2 font-mono text-sm text-ink">
                        {apiKey}
                      </code>
                    </div>
                  ) : keysLoading ? (
                    <Skeleton variant="line" className="w-full h-10" />
                  ) : error && keys === null ? (
                    <button type="button" onClick={() => void loadKeys()} className={buttonClasses("secondary", "sm")}>Reintentar consulta</button>
                  ) : !keys || keys.length === 0 ? (
                    <p className="text-sm text-muted">
                      Aun no tienes claves de API.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {keys.map((k) => (
                        <div
                          key={k.id}
                          className="flex items-center gap-3 rounded-md border border-line bg-surface/30 px-3 py-2"
                        >
                          <code className="flex-1 font-mono text-xs text-muted truncate">
                            qlk_••••••••••••••••
                          </code>
                          <span className="metric text-[13px] text-muted">
                            {new Date(k.created_at).toLocaleDateString("es-CO")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className={buttonClasses("secondary", "sm") + " mt-4"}
                  >
                    {regenerating ? "Generando..." : "Regenerar clave"}
                  </button>
                </CardBody>
              </Card>

              {/* MCP Server */}
              <Card>
                <CardBody className="p-6">
                  <h2 className="text-sm font-semibold text-ink mb-4">
                    Servidor MCP
                  </h2>
                  <p className="text-sm text-muted mb-3">
                    Conecta tu agente de IA directamente con el motor de
                    backtest de QuantLab.
                  </p>
                  <pre className="overflow-x-auto rounded-md border border-line bg-surface-solid p-3 font-mono text-sm text-muted">
{`claude mcp add quantlab -e QUANTLAB_TOKEN=qlk_tu_clave -- python mcp_server.py`}
                  </pre>
                  <p className="mt-2 text-[13px] text-muted">
                    Guia completa en{" "}
                    <Link
                      href="/app/api-keys/instructions"
                      className="text-accent hover:underline"
                    >
                      instrucciones del servidor MCP
                    </Link>
                    .
                  </p>
                </CardBody>
              </Card>
            </div>
          )}

          {tab === "security" && (
            <Card><CardBody className="p-6">
              <h2 id="security" className="font-semibold text-ink">Cambiar contraseña</h2>
              <form className="mt-4 max-w-md space-y-4" onSubmit={changePassword}>
                <label className="block text-sm text-ink">Nueva contraseña
                  <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 block w-full rounded-md border border-line bg-bg px-3 py-2 text-base" />
                </label>
                <label className="block text-sm text-ink">Confirmar contraseña
                  <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-2 block w-full rounded-md border border-line bg-bg px-3 py-2 text-base" />
                </label>
                <button type="submit" disabled={savingPassword} className={buttonClasses("primary", "sm")}>{savingPassword ? "Guardando…" : "Actualizar contraseña"}</button>
                {passwordSaved && <p role="status" className="text-sm text-long">Contraseña actualizada.</p>}
              </form>
            </CardBody></Card>
          )}

          {tab === "danger" && (
            <Card>
              <CardBody className="p-6">
                <h2 className="text-sm font-semibold text-ink mb-4">
                  Zona de peligro
                </h2>
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-ink">
                        Cerrar sesion en todos los dispositivos
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        Tu sesion actual tambien se cerrara.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOutAll}
                      disabled={signingOutAll}
                      className={buttonClasses("secondary", "sm")}
                    >
                      {signingOutAll ? "Cerrando..." : "Cerrar sesion"}
                    </button>
                  </div>
                  <div className="border-t border-line pt-4">
                    <p className="text-sm text-ink">Eliminación de cuenta</p>
                    <p className="mt-1 text-sm text-muted">La eliminación de cuentas desde la web todavía no está disponible. No se ejecutará ninguna eliminación desde esta pantalla.</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
