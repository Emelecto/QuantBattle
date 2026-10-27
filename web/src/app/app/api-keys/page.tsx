"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/useAuth";
import { call } from "@/lib/tournaments";

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
  const [client, setClient] = useState<"generic" | "claude" | "cursor" | "codex">("generic");

  const mcpConfig = newKey
    ? client === "claude"
      ? `claude mcp add quantlab -e QUANTLAB_TOKEN=${newKey} -- python C:/Users/ecard/QuantLab/mcp-server/mcp_server.py`
      : client === "cursor"
        ? JSON.stringify({ mcpServers: { quantlab: { command: "python", args: ["C:/Users/ecard/QuantLab/mcp-server/mcp_server.py"], env: { QUANTLAB_TOKEN: newKey } } } }, null, 2)
        : client === "codex"
          ? `[mcp_servers.quantlab]\ncommand = "python"\nargs = ["C:/Users/ecard/QuantLab/mcp-server/mcp_server.py"]\nenv = { QUANTLAB_TOKEN = "${newKey}" }`
          : JSON.stringify({ mcpServers: { quantlab: { command: "python", args: ["C:/Users/ecard/QuantLab/mcp-server/mcp_server.py"], env: { QUANTLAB_TOKEN: newKey } } } }, null, 2)
    : "";

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
    load();
  }, [user, load]);

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
              Crea una clave para conectar cualquier agente compatible con MCP a
              QuantLab. Necesitarás iniciar sesión para crear, consultar o revocar
              tus claves.
            </p>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="ql-glass ql-elev-1 flex max-w-md flex-col items-center gap-5 rounded-xl p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
              <span className="text-2xl">🔑</span>
            </div>
            <h2 className="text-xl font-semibold text-ink">
              Necesitas una cuenta para acceder
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Las claves API son personales y te permiten conectar tu agente de IA
              con QuantLab. Crea una cuenta gratuita o
              inicia sesión para empezar.
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
      <section className="ql-page flex-1">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">API y MCP</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Administra tus claves API y conecta cualquier agente compatible con MCP
          a los torneos ML de QuantLab. La clave se muestra una sola vez y puedes
          revocarla cuando quieras.
        </p>

        {/* Crear nueva clave */}
        <div className="ql-glass ql-elev-1 mt-8 rounded-xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="Nombre de la clave"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Nombre de la clave (ej: Mi agente de investigación)"
              maxLength={50}
              className="ql-input flex-1 rounded-md px-3 py-2 text-sm text-ink"
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

            <div className="mt-5 rounded-lg border border-line p-4">
              <p className="text-sm font-semibold text-ink">Configura tu agente MCP</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                QuantLab usa MCP estándar por stdio. Elige un cliente para ver su configuración; otros agentes compatibles pueden usar el ejemplo JSON genérico.
              </p>
              <label className="mt-4 block text-xs font-medium text-muted" htmlFor="mcp-client">Cliente de IA</label>
              <select id="mcp-client" value={client} onChange={(event) => setClient(event.target.value as typeof client)} className="ql-input mt-1 w-full rounded-md px-3 py-2 text-sm text-ink sm:max-w-xs">
                <option value="generic">Otro agente MCP (JSON)</option>
                <option value="claude">Claude Code</option>
                <option value="cursor">Cursor</option>
                <option value="codex">Codex CLI</option>
              </select>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md border border-line bg-surface-solid p-3 font-mono text-xs leading-relaxed text-muted">{mcpConfig}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(mcpConfig).then(() => { setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 2000); }).catch(() => setError("No se pudo copiar. Selecciona la configuración y cópiala manualmente."))}
                  className={buttonClasses("secondary", "sm") + " shrink-0 self-start"}
                >{copiedCmd ? "✓ Copiada" : "Copiar configuración"}</button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Reemplaza la ruta de ejemplo por la ubicación de <code className="font-mono">mcp_server.py</code> en tu equipo. Guarda la clave como variable <code className="font-mono">QUANTLAB_TOKEN</code> y no la compartas.
              </p>
            </div>
          </div>
        )}

        {/* Listado */}
        <h2 className="mt-10 text-lg font-semibold text-ink">Tus claves</h2>
        {loading ? (
          <div className="mt-4 space-y-3">
            <Skeleton variant="line" />
            <Skeleton variant="line" />
          </div>
        ) : error && keys === null ? (
          <div className="mt-4" role="alert"><p className="text-sm text-muted">No se pudieron consultar tus claves.</p><button type="button" onClick={() => void load()} className={buttonClasses("secondary", "sm") + " mt-3"}>Reintentar carga</button></div>
        ) : !keys || keys.length === 0 ? (
          <div className="ql-glass ql-elev-1 mt-4 rounded-xl px-6 py-10 text-center">
            <p className="text-sm text-muted">
              Aún no tienes claves. Crea una arriba para conectar tu agente de IA.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            {/* Últimas 3 claves */}
            <div className="ql-glass overflow-hidden rounded-xl">
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
                <div className="ql-glass mt-2 overflow-hidden rounded-xl">
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

        <div className="ql-glass ql-elev-1 mt-10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink">¿Qué puedes hacer con el MCP?</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">Descubrir torneos ML, consultar plazos y reglas, localizar datasets públicos, validar predicciones y enviar tu CSV con la ficha del modelo. Las acciones de cuenta usan esta clave API.</p>
          <p className="mt-3 text-sm text-muted">Consulta las <Link href="/app/api-keys/instructions" className="text-accent hover:underline">instrucciones de conexión</Link> para más ejemplos de clientes MCP.</p>
        </div>
      </section>
    </main>
  );
}
