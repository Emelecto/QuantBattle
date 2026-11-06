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

const WORKER_URL = (
  Deno.env.get("QUANTBATTLE_WORKER_URL") ?? "https://quantlab2.onrender.com"
).replace(/\/$/, "");
const MAX_CSV_BYTES = 10 * 1024 * 1024;

type CsvRow = { id: string; prediction: string };
type ValidationResult = {
  valid: boolean;
  reason?: string;
  rows?: number;
  expected_rows?: number;
  missing_count?: number;
  extra_count?: number;
  missing_ids?: string[];
  extra_ids?: string[];
  version?: string;
  prediction_min?: number;
  prediction_max?: number;
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("No se recibió una sesión válida de QuantBattle.");
  return value.slice(7).trim();
}

async function worker(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`El servicio de QuantBattle respondió HTTP ${response.status}: ${body.slice(0, 600)}`);
  }
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function parseCsv(content: string): CsvRow[] {
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_CSV_BYTES) throw new Error("El CSV supera el límite de 10 MB.");
  const lines = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines.at(-1)?.trim() === "") lines.pop();
  if (lines.shift()?.trim() !== "id,prediction") throw new Error("La cabecera debe ser exactamente: id,prediction");
  if (!lines.length) throw new Error("El CSV debe contener al menos una predicción.");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== 2) throw new Error(`Fila ${index + 2}: se esperaban exactamente dos columnas.`);
    const id = cells[0].trim();
    const prediction = cells[1].trim();
    const value = Number(prediction);
    if (!id) throw new Error(`Fila ${index + 2}: id vacío.`);
    if (seen.has(id)) throw new Error(`Fila ${index + 2}: id duplicado (${id}).`);
    if (!prediction || !Number.isFinite(value)) throw new Error(`Fila ${index + 2}: prediction debe ser un número finito.`);
    seen.add(id);
    return { id, prediction };
  });
}

async function validateCsv(
  token: string,
  csv: string,
  protocol: "practice_spearman" | "daily_return_mae",
  datasetId: string,
  roundId: string,
): Promise<ValidationResult> {
  try {
    const rows = parseCsv(csv);
    const values = rows.map((row) => Number(row.prediction));
    const [minimum, maximum] = protocol === "practice_spearman" ? [0, 1] : [-1, 10];
    if (values.some((value) => value < minimum || value > maximum)) {
      return { valid: false, reason: `prediction debe estar entre ${minimum} y ${maximum}.` };
    }

    const isPractice = protocol === "practice_spearman";
    if (isPractice && !datasetId) return { valid: false, reason: "Falta dataset_id." };
    if (!isPractice && !roundId) return { valid: false, reason: "Falta round_id." };
    const index = isPractice
      ? await worker(`/ml/datasets/${encodeURIComponent(datasetId)}/rows`, token)
      : await worker(`/ml/return-rounds/${encodeURIComponent(roundId)}/rows`, token);
    const expectedRows: Array<[string, string?]> = isPractice
      ? (index?.rows ?? []).map((row: unknown[]) => [String(row[0]), String(row[1])])
      : (index?.ids ?? []).map((id: string) => [String(id)]);
    const expected = new Set(expectedRows.map(([id]) => id));
    const actual = new Set(rows.map((row) => row.id));
    const missing = [...expected].filter((id) => !actual.has(id));
    const extra = [...actual].filter((id) => !expected.has(id));
    if (missing.length || extra.length || rows.length !== expected.size) {
      return {
        valid: false,
        reason: "El CSV debe incluir todos los IDs publicados exactamente una vez.",
        rows: rows.length,
        expected_rows: expected.size,
        missing_count: missing.length,
        extra_count: extra.length,
        missing_ids: missing.slice(0, 20),
        extra_ids: extra.slice(0, 20),
      };
    }
    if (isPractice) {
      const byId = new Map(rows.map((row) => [row.id, Number(row.prediction)]));
      const eras = new Map<string, Set<number>>();
      for (const [id, era] of expectedRows) {
        const valuesByEra = eras.get(era ?? "") ?? new Set<number>();
        valuesByEra.add(byId.get(id)!);
        eras.set(era ?? "", valuesByEra);
      }
      const flatEras = [...eras.entries()].filter(([, predictions]) => predictions.size < 2).map(([era]) => era);
      if (flatEras.length) {
        return { valid: false, reason: "Cada era necesita al menos dos valores de predicción distintos.", missing_count: 0, extra_count: 0 };
      }
    }
    return {
      valid: true,
      rows: rows.length,
      version: index?.version,
      prediction_min: values.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY),
      prediction_max: values.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY),
    };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "No se pudo validar el CSV." };
  }
}

function encodeExperiment(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("experiment_json debe ser JSON válido.");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("experiment_json debe ser un objeto JSON.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (encoded.length > 6000) throw new Error("La ficha experimental supera el límite permitido.");
  return encoded;
}

export function createServer(token: string, userId?: string, publicOnly = false) {
  const server = new McpServer({
    name: "quantbattle",
    version: "3.0.0",
  }, {
    instructions:
      "Ayudas a participar en torneos de predicción ML de QuantBattle. La práctica ML usa Spearman por era con predicciones entre 0 y 1; retornos diarios usa valores entre -1 y 10 y MAE frente a cero. Consulta reglas y datasets antes de entrenar. El archivo live no contiene respuestas. No inventes scores ni resultados. Para enviar predicciones valida primero el CSV completo.",
  });

  if (!publicOnly) {
    server.registerTool("get_connection_status", {
      description: "Confirma la cuenta autenticada en QuantBattle. Usa esta herramienta al terminar la conexión OAuth; no requiere que Render esté disponible.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    }, async () => ({ content: [{ type: "text", text: json({
      connected: true,
      authenticated: true,
      user_id: userId,
      authentication: "oauth_bearer",
      capabilities: ["public_datasets", "own_submissions", "submit_predictions"],
      note: "La sesión es válida para esta solicitud. Los plazos y reglas de cada torneo se verifican al enviar.",
    }) }] }));
  }

  server.registerTool("quantbattle_status", {
    description: "Comprueba la conexión y resume el estado de los módulos ML de QuantBattle.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => {
    const [health, weeks, datasets, practice] = await Promise.all([
      worker("/health", token),
      worker("/ml/return-tournaments", token),
      worker("/ml/datasets", token),
      worker("/tournament/ml", token),
    ]);
    return { content: [{ type: "text", text: json({ connected: true, worker: WORKER_URL, health, weekly_return_tournaments: weeks?.tournaments?.length ?? 0, published_practice_ml_datasets: datasets?.datasets?.length ?? 0, practice_ml_tournaments: Array.isArray(practice) ? practice.length : 0 }) }] };
  });

  server.registerTool("list_ml_tournaments", {
    description: "Lista torneos semanales de retornos y rondas de práctica ML, sus estados, plazos y datasets.",
    inputSchema: z.object({ include_closed: z.boolean().default(false) }),
    annotations: { readOnlyHint: true },
  }, async ({ include_closed }) => {
    const [weeksData, practice, datasets] = await Promise.all([
      worker("/ml/return-tournaments", token),
      worker("/tournament/ml", token),
      worker("/ml/datasets", token),
    ]);
    const live = new Map<string, Record<string, unknown>>();
    for (const dataset of datasets?.datasets ?? []) {
      if (dataset.kind === "live") live.set(`${dataset.tournament_id}:${dataset.round_number}`, dataset);
    }
    const weekly = (weeksData?.tournaments ?? []).map((week: Record<string, any>) => ({
      ...Object.fromEntries(["id", "name", "protocol", "week_start", "timezone", "asset_count", "status", "release_at", "results_released", "rules"].map((key) => [key, week[key]])),
      rounds: (week.rounds ?? []).map((round: Record<string, any>) => ({ ordinal: round.ordinal, round_id: round.id, status: round.status, submission_day: round.submission_day, target_day: round.target_day, opens_at: round.opens_at, closes_at: round.closes_at, version: round.version, files: round.dataset?.files })),
    }));
    const practiceItems = (practice ?? []).map((item: Record<string, any>) => {
      const rounds = [...live.entries()].filter(([key]) => key.startsWith(`${item.id}:`)).map(([, ds]) => ({ round_number: ds.round_number, live_dataset_id: ds.id, status: ds.status, round_type: ds.round_type, closes_at: ds.closes_at, version: ds.version, rows: ds.row_count, features: ds.feature_cols }));
      const active = rounds.filter((round: Record<string, any>) => round.status === "ready");
      return { id: item.id, name: item.name, status: active.length ? "open" : "closed", active_rounds: active, database_status: item.status, round_type: item.round_type, submission_deadline: item.submission_deadline, primary_metric: item.primary_metric, rules_text: item.rules_text, rounds };
    }).filter((item: Record<string, any>) => include_closed || item.active_rounds.length);
    return { content: [{ type: "text", text: json({ weekly_return_tournaments: weekly, practice_ml_tournaments: practiceItems }) }] };
  });

  server.registerTool("get_weekly_tournament", {
    description: "Consulta reglas, calendario y datasets publicados de una semana de retornos.",
    inputSchema: z.object({ week_id: z.string().min(1) }),
    annotations: { readOnlyHint: true },
  }, async ({ week_id }) => ({ content: [{ type: "text", text: json(await worker(`/ml/return-tournaments/${encodeURIComponent(week_id)}`, token)) }] }));

  server.registerTool("list_practice_datasets", {
    description: "Lista datasets públicos del torneo ML de práctica.",
    inputSchema: z.object({ tournament_id: z.string().default(""), round_number: z.number().int().min(0).default(0) }),
    annotations: { readOnlyHint: true },
  }, async ({ tournament_id, round_number }) => {
    const params = new URLSearchParams();
    if (tournament_id) params.set("tournament_id", tournament_id);
    if (round_number > 0) params.set("round_number", String(round_number));
    return { content: [{ type: "text", text: json(await worker(`/ml/datasets${params.size ? `?${params}` : ""}`, token)) }] };
  });

  server.registerTool("get_practice_dataset_download", {
    description: "Obtiene el enlace público de train, validation o live para una ronda de práctica.",
    inputSchema: z.object({ dataset_id: z.string().min(1), kind: z.enum(["train", "validation", "live"]) }),
    annotations: { readOnlyHint: true },
  }, async ({ dataset_id, kind }) => ({ content: [{ type: "text", text: json(await worker(`/ml/datasets/${encodeURIComponent(dataset_id)}/download?kind=${kind}`, token)) }] }));

  server.registerTool("get_weekly_dataset_download", {
    description: "Obtiene el enlace público de train, validation o live para una ronda semanal.",
    inputSchema: z.object({ round_id: z.string().min(1), kind: z.enum(["train", "validation", "live"]) }),
    annotations: { readOnlyHint: true },
  }, async ({ round_id, kind }) => ({ content: [{ type: "text", text: json(await worker(`/ml/return-rounds/${encodeURIComponent(round_id)}/download/${kind}`, token)) }] }));

  server.registerTool("get_weekly_live_ids", {
    description: "Recupera IDs públicos del dataset live semanal, sin respuestas objetivo.",
    inputSchema: z.object({ round_id: z.string().min(1) }),
    annotations: { readOnlyHint: true },
  }, async ({ round_id }) => {
    const result = await worker(`/ml/return-rounds/${encodeURIComponent(round_id)}/rows`, token);
    return { content: [{ type: "text", text: json({ round_id: result?.round_id, version: result?.version, ids: result?.ids }) }] };
  });

  server.registerTool("validate_prediction_csv", {
    description: "Valida el contenido de un CSV id,prediction antes del envío, incluyendo rango y cobertura exacta de IDs live.",
    inputSchema: z.object({ csv_content: z.string().min(1).max(MAX_CSV_BYTES), protocol: z.enum(["practice_spearman", "daily_return_mae"]), dataset_id: z.string().default(""), round_id: z.string().default("") }),
    annotations: { readOnlyHint: true },
  }, async ({ csv_content, protocol, dataset_id, round_id }) => ({ content: [{ type: "text", text: json(await validateCsv(token, csv_content, protocol, dataset_id, round_id)) }] }));

  if (!publicOnly) {
    server.registerTool("submit_practice_predictions", {
      description: "Envía CSV id,prediction a una ronda de práctica. Valida cobertura y límites antes del envío.",
      inputSchema: z.object({ dataset_id: z.string().min(1), csv_content: z.string().min(1).max(MAX_CSV_BYTES), experiment_json: z.string().min(2).max(12000) }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    }, async ({ dataset_id, csv_content, experiment_json }) => {
      const validation = await validateCsv(token, csv_content, "practice_spearman", dataset_id, "");
      if (!validation.valid) throw new Error(`CSV no enviado: ${validation.reason}`);
      const response = await worker(`/ml/datasets/${encodeURIComponent(dataset_id)}/predictions`, token, { method: "POST", headers: { "Content-Type": "text/csv", "X-QuantBattle-Experiment": encodeExperiment(experiment_json) }, body: csv_content });
      return { content: [{ type: "text", text: json(response) }] };
    });
  }

  if (!publicOnly) {
    server.registerTool("submit_weekly_predictions", {
      description: "Envía CSV id,prediction a una ronda semanal abierta. Valida cobertura y límites antes del envío.",
      inputSchema: z.object({ round_id: z.string().min(1), csv_content: z.string().min(1).max(MAX_CSV_BYTES), experiment_json: z.string().min(2).max(12000) }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    }, async ({ round_id, csv_content, experiment_json }) => {
      const validation = await validateCsv(token, csv_content, "daily_return_mae", "", round_id);
      if (!validation.valid) throw new Error(`CSV no enviado: ${validation.reason}`);
      const response = await worker(`/ml/return-rounds/${encodeURIComponent(round_id)}/predictions`, token, { method: "POST", headers: { "Content-Type": "text/csv", "X-QuantBattle-Experiment": encodeExperiment(experiment_json) }, body: csv_content });
      return { content: [{ type: "text", text: json(response) }] };
    });
  }

  if (!publicOnly) {
    server.registerTool("get_my_practice_submission", {
      description: "Consulta el comprobante del usuario para una ronda de práctica.",
      inputSchema: z.object({ dataset_id: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    }, async ({ dataset_id }) => ({ content: [{ type: "text", text: json(await worker(`/ml/predictions/mine?dataset_id=${encodeURIComponent(dataset_id)}`, token)) }] }));
  }

  if (!publicOnly) {
    server.registerTool("get_my_weekly_submissions", {
      description: "Consulta intentos y comprobantes propios para una ronda semanal.",
      inputSchema: z.object({ round_id: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    }, async ({ round_id }) => ({ content: [{ type: "text", text: json(await worker(`/ml/return-rounds/${encodeURIComponent(round_id)}/mine`, token)) }] }));
  }

  server.registerTool("get_ml_leaderboard", {
    description: "Consulta el ranking público de práctica ML cuando esté puntuado.",
    inputSchema: z.object({ dataset_id: z.string().min(1) }),
    annotations: { readOnlyHint: true },
  }, async ({ dataset_id }) => ({ content: [{ type: "text", text: json(await worker(`/ml/leaderboard?dataset_id=${encodeURIComponent(dataset_id)}`, token)) }] }));

  server.registerTool("get_weekly_results", {
    description: "Consulta resultados semanales públicos una vez liberados.",
    inputSchema: z.object({ week_id: z.string().min(1) }),
    annotations: { readOnlyHint: true },
  }, async ({ week_id }) => ({ content: [{ type: "text", text: json(await worker(`/ml/return-tournaments/${encodeURIComponent(week_id)}/results`, token)) }] }));

  return server;
}

// Discovery remains accessible; every other request on the main endpoint is authenticated.
// Public access is deliberately opt-in and never registers account or write tools.
const authenticated = pipeline(
  [withOAuthProtectedResource({ resourceServer: () => `${(Deno.env.get("SUPABASE_PUBLIC_URL") ?? Deno.env.get("SUPABASE_URL") ?? "https://ejwusgwgezvyylepagpz.supabase.co").replace(/\/$/, "")}/functions/v1/quantbattle-mcp` }), withSupabase({ auth: "user" })],
  async (request, { supabase }) => {
    const token = bearerToken(request);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let verified: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      verified = await Promise.race([
        supabase.auth.getUser(token),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("auth_timeout")), 10_000); }),
      ]);
    } catch {
      return Response.json({ error: "temporarily_unavailable", error_description: "No pudimos comprobar la sesión. Vuelve a intentar la conexión; no necesitas crear una API key." }, { status: 503, headers: { "Retry-After": "10" } });
    } finally {
      clearTimeout(timer);
    }
    const { data, error } = verified;
    if (error && (!error.status || error.status >= 500)) {
      return Response.json({ error: "temporarily_unavailable", error_description: "El servicio de autorización no está disponible. Reintenta la conexión." }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (error || !data.user) {
      return Response.json({ error: "invalid_token", error_description: "La sesión no es válida. Vuelve a autorizar QuantBattle desde tu agente." }, { status: 401 });
    }
    return createMcpHandler(() => createServer(token, data.user.id)).fetch(request);
  },
);

export async function handleMcpRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  let response: Response;
  if (path.replace(/^\/functions\/v1(?=\/)/, "") === "/quantbattle-mcp/public") {
    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
    } else {
      // Ignore credentials on the public endpoint. It can never act as a user.
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      response = await createMcpHandler(() => createServer("", undefined, true)).fetch(new Request(request, { headers }));
    }
  } else {
    response = await authenticated(request);
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID");
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
