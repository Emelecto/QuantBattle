import "jsr:@supabase/functions-js@2.119.0/edge-runtime.d.ts";
import { pipeline } from "npm:@supabase/middleware@1.0.0";
import {
  withOAuthProtectedResource,
  withSupabase,
} from "npm:@supabase/server@1.9.2";
import {
  createMcpHandler,
  McpServer,
} from "npm:@modelcontextprotocol/server@2.4.0";
import { z } from "npm:zod@4.6.7";
import history from "../../../web/src/data/stock-history-v1.json" with { type: "json" };

const WORKER_URL = (
  Deno.env.get("QUANTBATTLE_WORKER_URL") ?? "https://quantlab2.onrender.com"
).replace(/\/$/, "");
const PROTOCOL = "stocks_open_close_mae_v1";
const MAX_BYTES = 1024 * 1024;
const dailyFile = z.enum([
  "live.csv",
  "live.parquet",
  "submission_template.csv",
  "manifest.json",
  "README.md",
  "quality_report.json",
]);
const roundId = z.string().regex(/^stocks-oc-\d{4}-\d{2}-\d{2}$/);
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
function bearerToken(request: Request) {
  return request.headers.get("authorization")!.slice(7).trim();
}
async function worker(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(WORKER_URL + path, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(
      `QuantBattle HTTP ${response.status}: ${body.slice(0, 400)}`,
    );
  return JSON.parse(body);
}
function historyInfo() {
  return {
    source: "Alpaca",
    feed: "SIP",
    protocol: PROTOCOL,
    ...history,
    instructions:
      "Descarga train.parquet y validation.parquet una sola vez. No descargues una copia por ronda. Las rondas diarias usan live.csv o live.parquet (mismo contenido), sin target. Verifica el SHA-256 de los bytes descargados usando files[nombre].sha256.",
  };
}
function parsePredictions(csv: string) {
  if (new TextEncoder().encode(csv).length > MAX_BYTES)
    throw new Error("CSV mayor de 1 MB.");
  const lines = csv
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trimEnd()
    .split("\n");
  if (lines.shift() !== "id,prediction" || !lines.length)
    throw new Error("Usa la cabecera id,prediction y al menos una predicción.");
  const ids = new Set<string>();
  for (const line of lines) {
    const parts = line.split(",");
    const value = Number(parts[1]);
    if (
      parts.length !== 2 ||
      !parts[0] ||
      ids.has(parts[0]) ||
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(parts[1].trim()) ||
      !Number.isFinite(value) ||
      value < -1 ||
      value > 10
    )
      throw new Error(
        "CSV inválido: incluye cada ID una vez y retornos decimales entre -1 y 10.",
      );
    ids.add(parts[0]);
  }
  return ids;
}
async function validatePredictions(token: string, id: string, csv: string) {
  const ids = parsePredictions(csv);
  const file = await worker(
    `/ml/stock-rounds/${id}/download/submission_template.csv`,
    token,
  );
  const response = await fetch(file.url, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("No se pudo verificar la plantilla de esta ronda.");
  const bytes = await response.arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (sha !== file.sha256)
    throw new Error(
      "La plantilla no coincide con su SHA-256. No se enviaron predicciones.",
    );
  const expected = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[0]);
  if (expected.length !== ids.size || expected.some((id) => !ids.has(id)))
    throw new Error(
      `Incluye exactamente los ${expected.length} IDs de esta ronda.`,
    );
  return { valid: true, rows: ids.size, protocol: PROTOCOL, round_id: id };
}
export function createServer(
  token: string,
  userId?: string,
  publicOnly = false,
) {
  const server = new McpServer(
    { name: "quantbattle", version: "4.0.0" },
    {
      instructions:
        "QuantBattle usa exclusivamente el histórico y las rondas diarias de acciones de Alpaca para este recorrido. Empieza con get_historical_dataset_download: un train y un validation, sin multiplicarlos por ronda. Consulta list_ml_tournaments para las rondas diarias publicadas. No uses datasets de protocolos retirados. Nunca presentes una ronda cerrada como disponible para enviar. Descarga live y plantilla sólo para la ronda elegida y verifica hashes de bytes. No inventes datasets si no hay rondas. Para verificar tu cuenta ejecuta get_connection_status.",
    },
  );
  server.registerTool(
    "get_historical_dataset_download",
    {
      description:
        "Histórico Alpaca de 50 acciones: un train (83.563 filas) y un validation (34.962), documentación y SHA-256 exactos. Se descargan una sola vez.",
      inputSchema: z.object({
        filename: z
          .enum([
            "train.parquet",
            "validation.parquet",
            "manifest.json",
            "README.md",
            "feature_definitions.json",
            "quality_report.json",
            "universe.csv",
            "quantbattle-stock-history-v1.zip",
          ])
          .optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ filename }) =>
      result(
        filename
          ? {
              source: "Alpaca",
              version: history.version,
              protocol: PROTOCOL,
              filename,
              ...history.files[filename],
              checksum_algorithm: "sha256",
              checksum_scope: "downloaded_file_bytes",
              checksums_url: history.checksums_url,
            }
          : historyInfo(),
      ),
  );
  server.registerTool(
    "list_ml_tournaments",
    {
      description:
        "Lista exclusivamente rondas diarias de acciones de Alpaca. Incluye el histórico de entrenamiento y validación. No hay torneo disponible si no hay rondas abiertas.",
      inputSchema: z.object({ include_closed: z.boolean().default(false) }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_closed }) => {
      if (publicOnly)
        return result({
          historical_dataset: historyInfo(),
          daily_rounds: [],
          daily_rounds_require_login: true,
          message:
            "Autoriza el endpoint principal para consultar datos diarios privados. Esta respuesta no consulta el calendario.",
        });
      const data = await worker("/ml/stock-rounds", token);
      const rounds = data.rounds.map((round: Record<string, unknown>) => ({
        ...round,
        source: "Alpaca",
        accepts_submissions:
          round.status === "open" &&
          Date.parse(String(round.deadline)) > Date.now(),
      }));
      return result({
        source: "Alpaca",
        protocol: PROTOCOL,
        historical_dataset: historyInfo(),
        daily_rounds: rounds.filter(
          (r: { accepts_submissions: boolean }) =>
            include_closed || r.accepts_submissions,
        ),
        published_round_count: rounds.length,
        message: rounds.length
          ? "Elige una ronda y consulta su plazo antes de enviar."
          : "Todavía no hay rondas diarias publicadas. Puedes preparar tu modelo con el histórico.",
      });
    },
  );
  if (!publicOnly) {
    server.registerTool(
      "get_connection_status",
      {
        description:
          "Confirma la identidad autenticada sin depender de Render.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () =>
        result({
          connected: true,
          authenticated: true,
          user_id: userId,
          source: "Alpaca",
          protocol: PROTOCOL,
          capabilities: [
            "historical_datasets",
            "daily_datasets",
            "own_stock_submissions",
            "submit_stock_predictions",
          ],
        }),
    );
    server.registerTool(
      "get_stock_round",
      {
        description:
          "Consulta el plazo, estado, archivos y reglas de una ronda diaria de acciones.",
        inputSchema: z.object({ round_id: roundId }),
        annotations: { readOnlyHint: true },
      },
      async ({ round_id }) => {
        const data = await worker("/ml/stock-rounds", token);
        const round = data.rounds.find(
          (r: { id: string }) => r.id === round_id,
        );
        if (!round)
          throw new Error("La ronda no está publicada en el catálogo actual.");
        return result({
          source: "Alpaca",
          ...round,
          accepts_submissions:
            round.status === "open" && Date.parse(round.deadline) > Date.now(),
        });
      },
    );
    server.registerTool(
      "get_daily_dataset_download",
      {
        description:
          "Obtiene enlace temporal y SHA-256 de un archivo diario de Alpaca. Live CSV y Parquet son formatos alternativos. No incluye train/validation por ronda.",
        inputSchema: z.object({ round_id: roundId, filename: dailyFile }),
        annotations: { readOnlyHint: true },
      },
      async ({ round_id, filename }) =>
        result({
          source: "Alpaca",
          protocol: PROTOCOL,
          round_id,
          filename,
          checksum_algorithm: "sha256",
          checksum_scope: "downloaded_file_bytes",
          ...(await worker(
            `/ml/stock-rounds/${round_id}/download/${filename}`,
            token,
          )),
        }),
    );
    server.registerTool(
      "validate_stock_prediction_csv",
      {
        description:
          "Valida formato, tamaño, rango e IDs completos usando la plantilla verificada de la ronda. No realiza envíos.",
        inputSchema: z.object({
          round_id: roundId,
          csv_content: z.string().min(1).max(MAX_BYTES),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ round_id, csv_content }) =>
        result(await validatePredictions(token, round_id, csv_content)),
    );
    server.registerTool(
      "submit_stock_predictions",
      {
        description:
          "Envía predicciones de acciones de Alpaca. Verifica IDs y plantilla; el servidor comprueba cierre y selecciona el último CSV válido. No ejecuta operaciones financieras.",
        inputSchema: z.object({
          round_id: roundId,
          csv_content: z.string().min(1).max(MAX_BYTES),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ round_id, csv_content }) => {
        await validatePredictions(token, round_id, csv_content);
        return result(
          await worker(`/ml/stock-rounds/${round_id}/predictions`, token, {
            method: "POST",
            headers: { "Content-Type": "text/csv" },
            body: csv_content,
          }),
        );
      },
    );
    server.registerTool(
      "get_my_stock_submissions",
      {
        description:
          "Consulta únicamente tus comprobantes y el envío seleccionado de la ronda diaria.",
        inputSchema: z.object({ round_id: roundId }),
        annotations: { readOnlyHint: true },
      },
      async ({ round_id }) =>
        result(await worker(`/ml/stock-rounds/${round_id}/mine`, token)),
    );
    server.registerTool(
      "get_stock_results",
      {
        description:
          "Consulta resultados verificados de una ronda diaria ya evaluada. Un resultado pendiente devuelve error, nunca una puntuación inventada.",
        inputSchema: z.object({ round_id: roundId }),
        annotations: { readOnlyHint: true },
      },
      async ({ round_id }) =>
        result(await worker(`/ml/stock-rounds/${round_id}/results`, token)),
    );
  }
  return server;
}

// Discovery remains accessible; every other request on the main endpoint is authenticated.
// Public access is deliberately opt-in and never registers account or write tools.
const authenticated = pipeline(
  [
    withOAuthProtectedResource({
      resourceServer: () =>
        `${(Deno.env.get("SUPABASE_PUBLIC_URL") ?? Deno.env.get("SUPABASE_URL") ?? "https://ejwusgwgezvyylepagpz.supabase.co").replace(/\/$/, "")}/functions/v1/quantbattle-mcp`,
    }),
    withSupabase({ auth: "user" }),
  ],
  async (request, { supabase }) => {
    const token = bearerToken(request);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let verified: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      verified = await Promise.race([
        supabase.auth.getUser(token),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("auth_timeout")), 10_000);
        }),
      ]);
    } catch {
      return Response.json(
        {
          error: "temporarily_unavailable",
          error_description:
            "No pudimos comprobar la sesión. Vuelve a intentar la conexión; no necesitas crear una API key.",
        },
        { status: 503, headers: { "Retry-After": "10" } },
      );
    } finally {
      clearTimeout(timer);
    }
    const { data, error } = verified;
    if (error && (!error.status || error.status >= 500)) {
      return Response.json(
        {
          error: "temporarily_unavailable",
          error_description:
            "El servicio de autorización no está disponible. Reintenta la conexión.",
        },
        { status: 503, headers: { "Retry-After": "10" } },
      );
    }
    if (error || !data.user) {
      return Response.json(
        {
          error: "invalid_token",
          error_description:
            "La sesión no es válida. Vuelve a autorizar QuantBattle desde tu agente.",
        },
        { status: 401 },
      );
    }
    return createMcpHandler(() => createServer(token, data.user.id)).fetch(
      request,
    );
  },
);

export async function handleMcpRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  let response: Response;
  if (
    path.replace(/^\/functions\/v1(?=\/)/, "") === "/quantbattle-mcp/public"
  ) {
    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
    } else {
      // Ignore credentials on the public endpoint. It can never act as a user.
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      response = await createMcpHandler(() =>
        createServer("", undefined, true),
      ).fetch(new Request(request, { headers }));
    }
  } else {
    response = await authenticated(request);
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  );
  headers.set(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version",
  );
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
