"use client";

import { useId, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";

const MCP_URL = "https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp";
const clients = {
  generic: { label: "Otro agente / conexión por URL", instruction: "Añade un servidor MCP remoto con transporte HTTP y esta URL.", configuration: MCP_URL },
  hermes: { label: "Hermes Agent", instruction: "Ejecuta el comando en la terminal de Hermes. El parámetro --auth oauth evita que te pida una API key. Si necesitas iniciar la autorización, ejecuta hermes mcp login quantbattle.", configuration: `hermes mcp add quantbattle --url "${MCP_URL}" --auth oauth --connect-timeout 60` },
  cursor: { label: "Cursor", instruction: "Añade esta configuración a .cursor/mcp.json en tu proyecto o a ~/.cursor/mcp.json para tu usuario.", configuration: JSON.stringify({ mcpServers: { quantbattle: { url: MCP_URL } } }, null, 2) },
  vscode: { label: "VS Code / Copilot", instruction: "Añade esta configuración a .vscode/mcp.json en tu proyecto.", configuration: JSON.stringify({ servers: { quantbattle: { type: "http", url: MCP_URL } } }, null, 2) },
  codex: { label: "Codex CLI", instruction: "Ejecuta este comando en tu terminal.", configuration: `codex mcp add quantbattle --url ${MCP_URL}` },
  claude: { label: "Claude Code", instruction: "Ejecuta este comando en tu terminal. Para gestionar la autorización, abre /mcp en Claude Code.", configuration: `claude mcp add --transport http quantbattle ${MCP_URL}` },
} as const;
type Client = keyof typeof clients;

export function McpConnection() {
  const id = useId();
  const [client, setClient] = useState<Client>("generic");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const selected = clients[client];
  const message = [
    `Conecta QuantBattle como servidor MCP remoto: ${MCP_URL}`,
    client !== "generic" ? `Cliente: ${selected.label}. Configuración:\n${selected.configuration}` : "Usa transporte HTTP.",
    "Para acciones de mi cuenta, usa OAuth y muéstrame el enlace para que yo inicie sesión y autorice el acceso. No me pidas una API key ni un token manual.",
    client === "hermes" ? "Si hace falta, inicia la autorización con hermes mcp login quantbattle." : "",
    "Refresca el catálogo de herramientas. Para datos usa get_historical_dataset_download (un train y un validation de Alpaca) y list_ml_tournaments. Descarga archivos diarios con get_daily_dataset_download para la ronda elegida. No reutilices herramientas ni datasets del protocolo anterior.",
    "Ejecuta get_connection_status y confirma mi user_id para verificar la autorización de mi cuenta. Si OAuth no se completa, informa el error exacto sin cambiar a API key.",
  ].filter(Boolean).join("\n\n");

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setCopyError(false);
    } catch {
      setCopied(null);
      setCopyError(true);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">Conecta tu agente a QuantBattle</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Elige tu agente y copia el mensaje para que te ayude a configurar la conexión.</p>
      <label htmlFor={`${id}-client`} className="mt-5 block text-sm font-medium text-ink">¿Qué agente usas?</label>
      <select id={`${id}-client`} value={client} onChange={(event) => { setClient(event.target.value as Client); setCopied(null); setCopyError(false); }} className="qb-input mt-2 block min-h-11 w-full rounded-md px-3 py-2 text-base text-ink sm:max-w-sm">
        {Object.entries(clients).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select>

      <p id={`${id}-message`} className="mt-5 text-sm font-medium text-ink">Pega este mensaje en tu agente</p>
      <pre aria-labelledby={`${id}-message`} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-solid p-4 font-sans text-sm leading-relaxed text-ink" tabIndex={0}>{message}</pre>
      <button type="button" onClick={() => void copy(message, "message")} className={buttonClasses("primary", "md") + " mt-3"}>{copied === "message" ? "Mensaje copiado" : "Copiar mensaje para mi agente"}</button>

      <details className="mt-6 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Configurar manualmente o copiar la URL</summary>
        <label htmlFor={`${id}-url`} className="mt-4 block text-sm font-medium text-ink">URL del servidor MCP</label>
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
          <input id={`${id}-url`} value={MCP_URL} readOnly onFocus={(event) => event.currentTarget.select()} className="qb-input min-h-11 min-w-0 flex-1 rounded-md px-3 py-2 text-base text-ink" />
          <button type="button" onClick={() => void copy(MCP_URL, "url")} className={buttonClasses("secondary", "md")}>{copied === "url" ? "URL copiada" : "Copiar URL"}</button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">{selected.instruction}</p>
        {client !== "generic" && <>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-solid p-3 font-mono text-xs leading-relaxed text-ink" tabIndex={0} aria-label={`Configuración para ${selected.label}`}>{selected.configuration}</pre>
          <button type="button" onClick={() => void copy(selected.configuration, "configuration")} className={buttonClasses("secondary", "sm") + " mt-3"}>{copied === "configuration" ? "Configuración copiada" : "Copiar configuración"}</button>
        </>}
      </details>

      <div role="status" aria-live="polite" className="mt-3 text-sm text-muted">{copied === "message" ? "Pega el mensaje en tu agente para continuar." : copied === "url" ? "URL copiada al portapapeles." : copied === "configuration" ? "Configuración copiada al portapapeles." : ""}</div>
      {copyError && <p role="alert" className="mt-2 text-sm text-short">No pudimos copiar el texto. Selecciónalo y cópialo manualmente.</p>}

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">Al conectar se abrirá QuantBattle para iniciar sesión y autorizar el agente. Después pídele: «Ejecuta get_connection_status y confirma que mi cuenta está conectada». No basta con que aparezca la lista de herramientas.</p>
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">¿Te pide una API key o no abre el inicio de sesión?</summary>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Selecciona OAuth como método de autenticación. En Hermes, comprueba que el comando incluya <code className="font-mono">--auth oauth</code>. Si tu cliente no admite OAuth, usa el endpoint público de solo lectura que aparece abajo. Para acceder a tu cuenta necesitas un cliente con OAuth.</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">Si el navegador está en otro computador, el regreso a localhost debe llegar al computador donde corre el agente. Usa el mecanismo de retorno remoto que admita tu cliente; no compartas contraseñas ni tokens. Si el enlace venció o rechazaste el permiso, inicia una nueva autorización desde el agente.</p>
      </details>
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Descargar el histórico de Alpaca sin cuenta</summary>
        <p className="mt-3 text-sm leading-relaxed text-muted">Permite obtener train y validation de Alpaca con sus sumas de verificación. Para consultar rondas y archivos diarios o enviar predicciones, autoriza el endpoint principal. Configura este endpoint público sin autenticación.</p>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line p-3 text-xs" tabIndex={0}>{MCP_URL}/public</pre>
        <button type="button" onClick={() => void copy(`${MCP_URL}/public`, "public")} className={buttonClasses("secondary", "sm") + " mt-3"}>{copied === "public" ? "URL pública copiada" : "Copiar URL pública"}</button>
      </details>
    </section>
  );
}
