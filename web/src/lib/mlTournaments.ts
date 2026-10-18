/**
 * Cliente de torneos ML de predicciones (estilo Numerai) para QuantLab.
 *
 * Consume los endpoints `/ml/...` del Worker FastAPI (worker/ml_endpoints.py).
 * Reutiliza el helper `call` de `@/lib/tournaments`, que ya inyecta el Bearer
 * del token de sesión de Supabase y hace anti-cache.
 */
import { call } from "@/lib/tournaments";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Origen de los datos de la ronda. */
export type MlMode = "sintetico" | "real";

/** Rol del dataset dentro de la ronda. `live` publica features sin target. */
export type MlDatasetKind = "train" | "validation" | "live";

export interface MlDataset {
  id: string;
  tournament_id: string;
  round_number: number;
  mode: MlMode;
  kind: MlDatasetKind;
  status: string;
  n_assets: number;
  n_eras: number;
  n_features: number;
  row_count: number;
  feature_cols: string[] | null;
  closes_at: string | null;
  version: string | null;
  data_hash: string | null;
  round_type: "practice" | "historical" | "prospective";
  score_version: string;
  published_at: string | null;
  target_available_at: string | null;
  finalized_at: string | null;
  benchmarks: Record<string, number> | null;
  /** URL del parquet público; null para rondas antiguas sin archivo. */
  download_url: string | null;
}

export interface MlSubmission {
  id: string;
  row_count: number;
  status: string;
  score: number | null;
  corr_mean: number | null;
  fnc_mean: number | null;
  consistencia: number | null;
  meta_corr: number | null;
  is_valid: boolean | null;
  plagio_flag: boolean | null;
  submitted_at: string | null;
  scored_at: string | null;
  eval_error?: string | null;
  file_sha256?: string | null;
  dataset_version?: string | null;
  is_selected?: boolean;
  qp_earned?: number;
}

export interface MlLeaderboardEntry {
  user_id: string;
  score: number | null;
  corr_mean: number | null;
  fnc_mean: number | null;
  consistencia: number | null;
  is_valid: boolean | null;
  plagio_flag: boolean | null;
  submitted_at: string | null;
  /** El worker aún no reparte QP por ronda ML; queda opcional. */
  qp_earned?: number | null;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/**
 * Datasets de una ronda ML.
 *
 * El worker declara el filtro de ronda como `round_number`; se envían ambos
 * nombres (`round_number` y `round`) porque FastAPI ignora los extra y así el
 * filtro funciona con cualquiera de las dos firmas.
 */
export async function listDatasets(
  tournamentId?: string,
  round?: number,
): Promise<MlDataset[]> {
  const q = new URLSearchParams();
  if (tournamentId) q.set("tournament_id", tournamentId);
  if (round != null && Number.isFinite(round)) {
    q.set("round_number", String(round));
    q.set("round", String(round));
  }
  const qs = q.toString();
  const res = await call<{ datasets?: MlDataset[] }>(
    `/ml/datasets${qs ? `?${qs}` : ""}`,
  );
  return Array.isArray(res?.datasets) ? res.datasets : [];
}

/** URL pública (Storage) del parquet de una partición. */
export async function downloadDatasetUrl(
  datasetId: string,
  kind: MlDatasetKind,
): Promise<string> {
  const res = await call<{ url?: string }>(
    `/ml/datasets/${datasetId}/download?kind=${kind}`,
  );
  if (!res?.url) throw new Error("El worker no devolvió una URL de descarga.");
  return res.url;
}

/**
 * Envía predicciones al dataset `live` de la ronda.
 *
 * El archivo llega sin transformación; el worker es la única autoridad de
 * validación. Así se conservan las comillas, el orden y los bytes del recibo.
 */
export async function submitPredictions(
  datasetId: string,
  file: File,
): Promise<{ id: string; row_count: number; status: string; submission?: MlSubmission }> {
  return call<{ id: string; row_count: number; status: string; submission?: MlSubmission }>(
    `/ml/datasets/${datasetId}/predictions`,
    { method: "POST", headers: { "Content-Type": "text/csv" }, body: file },
  );
}

/** Mi envío para una ronda, o `null` si aún no envié nada. */
export async function myPrediction(
  datasetId: string,
): Promise<MlSubmission | null> {
  try {
    const res = await call<{ submission?: MlSubmission | null }>(
      `/ml/predictions/mine?dataset_id=${encodeURIComponent(datasetId)}`,
    );
    return res?.submission ?? null;
  } catch {
    return null;
  }
}

/** Estado de una submission propia (para polling). */
export async function getSubmission(
  submissionId: string,
): Promise<MlSubmission | null> {
  try {
    const res = await call<{ submission?: MlSubmission | null }>(
      `/ml/submissions/${encodeURIComponent(submissionId)}`,
    );
    return res?.submission ?? null;
  } catch {
    return null;
  }
}

/** Ranking de la ronda (solo envíos válidos, ordenado por score). */
export async function mlLeaderboard(
  datasetId: string,
): Promise<MlLeaderboardEntry[]> {
  const res = await call<{ leaderboard?: MlLeaderboardEntry[] }>(
    `/ml/leaderboard?dataset_id=${encodeURIComponent(datasetId)}`,
  );
  return Array.isArray(res?.leaderboard) ? res.leaderboard : [];
}

/** Etiqueta en español del modo de la ronda. */
export function mlModeLabel(mode: MlMode | string | null | undefined): string {
  return mode === "real" ? "datos reales" : "sintético";
}

export function mlRoundTypeLabel(roundType: MlDataset["round_type"] | null | undefined): string {
  if (roundType === "prospective") return "Prospectivo";
  if (roundType === "historical") return "Piloto histórico";
  return "Práctica sintética";
}
