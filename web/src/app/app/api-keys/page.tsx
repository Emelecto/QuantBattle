"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/useAuth";
import { call } from "@/lib/tournaments";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const MCP_URL = "https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp";
const MCP_CLIENTS = {
  codex: { label: "Codex CLI", instruction: "Ejecuta esta línea en tu terminal:", value: `codex mcp add quantbattle --url ${MCP_URL}` },
  claude: { label: "Claude Code", instruction: "Ejecuta esta línea en tu terminal. Si necesitas autenticarte, abre /mcp en Claude Code:", value: `claude mcp add --transport http quantbattle ${MCP_URL}` },
  cursor: { label: "Cursor", instruction: "Añade esta configuración a .cursor/mcp.json en tu proyecto o a ~/.cursor/mcp.json para tu usuario:", value: JSON.stringify({ mcpServers: { quantbattle: { url: MCP_URL } } }, null, 2) },
  vscode: { label: "VS Code / Copilot", instruction: "Añade esta configuración a .vscode/mcp.json en tu proyecto:", value: JSON.stringify({ servers: { quantbattle: { type: "http", url: MCP_URL } } }, null, 2) },
  claudeapp: { label: "Claude", instruction: "En Claude, abre Configuración → Conectores y añade un conector personalizado con esta URL:", value: MCP_URL },
  chatgpt: { label: "ChatGPT", instruction: "En ChatGPT web, crea una app MCP personalizada desde Configuración → Apps usando esta URL. La disponibilidad y las acciones dependen de tu plan y permisos:", value: MCP_URL },
  other: { label: "Otro agente MCP", instruction: "Añade esta URL como servidor MCP remoto con transporte HTTP en tu cliente:", value: MCP_URL },
} as const;
type McpClient = keyof typeof MCP_CLIENTS;

type OAuthGrant = {
  client: { id: string; name: string; uri: string; logo_uri: string };
  scopes: string[];
  granted_at: string;
};

type ApiKeyRow = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default function ApiKeysPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [mcpClient, setMcpClient] = useState<McpClient>("codex");
  const [copyMcpError, setCopyMcpError] = useState(false);
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState(false);
  const [revokingGrant, setRevokingGrant] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await call<ApiKeyRow[]>("/account/api-keys");
      setKeys(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar claves");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    call<ApiKeyRow[]>("/account/api-keys")
      .then((data) => { if (active) { setKeys(data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Error al cargar claves"); })
      .finally(() => { if (active) setLoading(false); });
    createBrowserSupabaseClient().auth.oauth.listGrants()
      .then(({ data, error: grantsError }) => {
        if (!active) return;
        if (grantsError) throw grantsError;
        setGrants(data);
        setGrantsError(false);
      })
      .catch(() => { if (active) { setGrants(null); setGrantsError(true); } })
      .finally(() => { if (active) setGrantsLoading(false); });
    return () => { active = false; };
  }, [user]);

  async function revokeGrant(clientId: string) {
    setRevokingGrant(clientId);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (revokeError) throw revokeError;
      const { data, error: listError } = await supabase.auth.oauth.listGrants();
      if (listError) throw listError;
      setGrants(data);
      setGrantsError(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revocar el acceso del agente.");
    } finally {
      setRevokingGrant(null);
    }
  }

  async function createKey() {
    setCreating(true);
    setError(null);
    try {
      const json = await call<{key: string}>("/account/api-keys", {
        method: "POST", body: JSON.stringify({ name: keyName.trim() || "Mi clave" }),
      });
      setNewKey(json.key);
      setKeyName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear clave");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await call(`/account/api-keys/${id}`, { method: "DELETE" });
      setNewKey(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revocar la clave. Vuelve a intentar.");
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col">
        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-4xl px-6 py-16">
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              API y MCP
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Conecta tu agente al servidor MCP remoto de QuantBattle. Para enviar predicciones no necesitas crear ni copiar una clave API.
            </p>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="qb-glass qb-elev-1 flex max-w-md flex-col items-center gap-5 rounded-xl p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
              <span className="text-2xl">🔗</span>
            </div>
            <h2 className="text-xl font-semibold text-ink">
              Necesitas una cuenta para acceder
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Inicia sesión para conectar tu agente y autorizarlo de forma segura con tu cuenta.
            </p>
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className={buttonClasses("primary", "md") + " flex-1 justify-center"}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className={buttonClasses("secondary", "md") + " flex-1 justify-center"}
              >
                Crear cuenta
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <section className="qb-page flex-1">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">API y MCP</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Conecta tu agente de IA a los torneos ML de QuantBattle. El servidor remoto inicia sesión mediante OAuth; no tienes que copiar claves API ni instalar Python.
        </p>

        <div className="qb-glass qb-elev-1 mt-8 rounded-xl p-5">
          <h2 className="text-base font-semibold text-ink">Conecta tu agente MCP</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Añade el servidor una sola vez. Puedes consultar torneos y datasets públicos sin iniciar sesión; QuantBattle pedirá autorización al enviar predicciones o consultar tus comprobantes.</p>
          <div className="mt-4 rounded-lg border border-line bg-surface-solid p-4">
            <label htmlFor="mcp-client" className="text-xs font-medium text-muted">Elige tu agente</label>
            <select id="mcp-client" value={mcpClient} onChange={(event) => { setMcpClient(event.target.value as McpClient); setCopiedCmd(false); setCopyMcpError(false); }} className="qb-input mt-2 block w-full rounded-md px-3 py-2 text-sm text-ink sm:max-w-xs">
              {Object.entries(MCP_CLIENTS).map(([value, client]) => <option key={value} value={value}>{client.label}</option>)}
            </select>
            <p className="mt-4 text-sm leading-relaxed text-muted">{MCP_CLIENTS[mcpClient].instruction}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
              <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-ink">{MCP_CLIENTS[mcpClient].value}</pre>
              <button type="button" onClick={() => navigator.clipboard.writeText(MCP_CLIENTS[mcpClient].value).then(() => { setCopyMcpError(false); setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 2000); }).catch(() => setCopyMcpError(true))} className={buttonClasses("secondary", "sm") + " shrink-0"}>{copiedCmd ? "✓ Copiado" : "Copiar"}</button>
            </div>
            {copyMcpError && <p role="alert" className="mt-2 text-xs text-short">No se pudo copiar. Selecciona el texto y cópialo manualmente.</p>}
            <p className="mt-3 text-xs leading-relaxed text-muted">Para las acciones de tu cuenta, inicia sesión y autoriza el acceso cuando tu cliente lo solicite. El flujo depende de que el cliente admita OAuth para servidores MCP remotos.</p>
          </div>
        </div>

        <div className="qb-glass mt-4 rounded-xl p-5">
          <h2 className="text-base font-semibold text-ink">Agentes autorizados</h2>
          <p className="mt-1 text-sm text-muted">Puedes retirar el acceso de cualquier cliente desde aquí.</p>
          {grantsLoading ? <p className="mt-4 text-sm text-muted">Cargando autorizaciones…</p> : grantsError ? <p className="mt-4 text-sm text-muted">No se pudieron cargar las autorizaciones. Comprueba que OAuth esté habilitado en QuantBattle.</p> : grants?.length === 0 ? <p className="mt-4 text-sm text-muted">Todavía no has autorizado agentes externos.</p> : grants ? (
            <ul className="mt-4 divide-y divide-line">
              {grants.map((grant) => (
                <li key={grant.client.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{grant.client.name}</p>
                    <p className="mt-1 text-xs text-muted">Autorizado {new Date(grant.granted_at).toLocaleDateString("es-CO")}</p>
                  </div>
                  <button type="button" onClick={() => void revokeGrant(grant.client.id)} disabled={revokingGrant !== null} className="rounded-md border border-short/30 px-3 py-1.5 text-xs font-medium text-short transition-colors hover:bg-short/10 disabled:opacity-50">{revokingGrant === grant.client.id ? "Revocando…" : "Revocar acceso"}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Crear nueva clave */}
        <h2 className="mt-10 text-lg font-semibold text-ink">API para integraciones directas</h2>
        <p className="mt-1 text-sm text-muted">Opcional. No la necesitas para conectar un agente MCP.</p>
        <div className="qb-glass qb-elev-1 mt-8 rounded-xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="Nombre de la clave"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Nombre de la clave API"
              maxLength={50}
              className="qb-input flex-1 rounded-md px-3 py-2 text-sm text-ink"
            />
            <button
              onClick={createKey}
              disabled={creating}
              className={buttonClasses("primary", "md") + " shrink-0 justify-center"}
            >
              {creating ? "Creando…" : "Crear clave"}
            </button>
          </div>
          {error && (
            <p className="mt-2 rounded-md border border-short/30 bg-short/10 px-3 py-2 text-sm text-short">
              {error}
            </p>
          )}
        </div>

        {/* Clave recién creada — se muestra UNA sola vez */}
        {newKey && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/[0.07] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" />
              Copia tu clave ahora — no se volverá a mostrar
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="flex-1 overflow-x-auto rounded-md border border-line bg-surface-solid px-3 py-2 font-mono text-sm text-ink">
                {newKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKey).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }).catch(() => setError("No se pudo copiar. Selecciona la clave y cópiala manualmente."));
                }}
                className={buttonClasses("secondary", "sm") + " shrink-0"}
              >
                {copied ? "✓ Copiada" : "Copiar clave"}
              </button>
            </div>

            <p className="mt-4 text-xs text-muted">Esta clave sirve para llamadas directas a la API. El MCP remoto usa el inicio de sesión seguro de arriba.</p>
          </div>
        )}

        {/* Listado */}
        <h2 className="mt-10 text-lg font-semibold text-ink">Claves para integraciones API directas</h2>
        {loading ? (
          <div className="mt-4 space-y-3">
            <Skeleton variant="line" />
            <Skeleton variant="line" />
          </div>
        ) : error && keys === null ? (
          <div className="mt-4" role="alert"><p className="text-sm text-muted">No se pudieron consultar tus claves.</p><button type="button" onClick={() => void load()} className={buttonClasses("secondary", "sm") + " mt-3"}>Reintentar carga</button></div>
        ) : !keys || keys.length === 0 ? (
          <div className="qb-glass qb-elev-1 mt-4 rounded-xl px-6 py-10 text-center">
            <p className="text-sm text-muted">
              Aún no tienes claves API directas. El MCP remoto funciona sin ellas.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            {/* Últimas 3 claves */}
            <div className="qb-glass overflow-hidden rounded-xl">
              <ul className="divide-y divide-line">
                {keys.slice(0, 3).map((k) => (
                  <li key={k.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{k.name}</p>
                      <p className="metric text-[13px] text-muted">
                        Creada {new Date(k.created_at).toLocaleDateString("es-CO")}
                        {" · "}
                        {k.revoked_at
                          ? "Revocada"
                          : k.last_used_at
                            ? `Último uso ${new Date(k.last_used_at).toLocaleDateString("es-CO")}`
                            : "Nunca usada"}
                      </p>
                    </div>
                    {k.revoked_at ? (
                      <span className="metric text-xs text-muted">revocada</span>
                    ) : (
                      <button
                        onClick={() => revoke(k.id)}
                        className="rounded-md border border-short/30 px-3 py-1 text-xs font-medium text-short transition-colors hover:bg-short/10"
                      >
                        Revocar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Dropdown para ver todas */}
            {keys.length > 3 && (
              <details className="mt-2 group">
                <summary className="flex items-center justify-center gap-2 cursor-pointer select-none rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-line/30 transition-colors">
                  <span>Ver todas las claves ({keys.length})</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-180">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="qb-glass mt-2 overflow-hidden rounded-xl">
                  <ul className="divide-y divide-line">
                    {keys.slice(3).map((k) => (
                      <li key={k.id} className="flex items-center gap-4 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{k.name}</p>
                          <p className="metric text-[13px] text-muted">
                            Creada {new Date(k.created_at).toLocaleDateString("es-CO")}
                            {" · "}
                            {k.revoked_at
                              ? "Revocada"
                              : k.last_used_at
                                ? `Último uso ${new Date(k.last_used_at).toLocaleDateString("es-CO")}`
                                : "Nunca usada"}
                          </p>
                        </div>
                        {k.revoked_at ? (
                          <span className="metric text-xs text-muted">revocada</span>
                        ) : (
                          <button
                            onClick={() => revoke(k.id)}
                            className="rounded-md border border-short/30 px-3 py-1 text-xs font-medium text-short transition-colors hover:bg-short/10"
                          >
                            Revocar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        )}

        <div className="qb-glass qb-elev-1 mt-10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink">¿Para qué sirven estas claves?</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">Estas claves se reservan para integraciones directas con la API. Para conectar un agente mediante MCP, usa la línea de conexión de arriba y autoriza el acceso desde tu cuenta.</p>
          <p className="mt-3 text-sm text-muted">Consulta la <Link href="/docs#mcp" className="text-accent hover:underline">documentación MCP</Link>.</p>
        </div>
      </section>
    </main>
  );
}
