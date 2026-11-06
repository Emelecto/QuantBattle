import Papa from 'papaparse';

export type ReturnReceipt = {
  id: string; round_id: string; file_sha256: string; dataset_version: string; row_count: number;
  submitted_at: string; is_selected: boolean; status: string;
  score?: number; mae?: number; baseline_mae?: number;
  experiment: { model_name: string; parameters: Record<string, unknown>; seed: number | null; note: string } | null;
};
export type ReturnFile = { path: string; url: string; rows: number; hash: string; columns: string[] };
export type ReturnRound = {
  id: string; ordinal: number; observation_day: string; submission_day: string; target_day: string;
  opens_at: string; closes_at: string; target_start: string; target_end: string;
  status: 'scheduled' | 'preparing' | 'open' | 'closed' | 'published' | 'missed';
  published_at: string | null; version: string | null;
  dataset: { files: Record<'train' | 'validation' | 'live', ReturnFile>; source_commitment: string; asset_count: number } | null;
};
export type ReturnWeek = {
  id: string; name: string; week_start: string; timezone: string; protocol: string;
  asset_count: number; release_at: string; status: string; results_released: boolean;
  rounds: ReturnRound[]; results_url?: string; results_sha256?: string;
};
export type ReturnEvidence = {
  protocol: string; published_at: string; source: string;
  rounds: { id: string; ordinal: number; target_day: string; status: string;
    assets?: { id: string; symbol: string; open: number; close: number; return: number; open_time: number; close_time: number }[];
    evidence?: { url: string; sha256: string; version: string };
  }[];
};
export type ReturnResults = {
  evidence: ReturnEvidence; results_sha256: string;
  leaderboard: { user_id: string; username: string | null; eligible: boolean; rank: number | null;
    score: number | null; mean_mae: number | null;
    rounds: { ordinal: number; score: number; mae: number; baseline_mae: number }[];
  }[];
};
export const listReturnWeeks = async (): Promise<{ tournaments: ReturnWeek[] }> => ({ tournaments: [] });
export const getReturnHistory = async (): Promise<{ entries: (ReturnReceipt & { week_id: string; week_name: string; ordinal: number; target_day: string })[] }> => ({ entries: [] });
export function reviewReturnCsv(text: string, ids: string[]): string[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: false });
  const rows = parsed.data;
  const header = rows.shift();
  const issues: string[] = [];
  if (parsed.errors.length) issues.push('El CSV tiene comillas o filas mal formadas.');
  if (header?.length !== 2 || header[0] !== 'id' || header[1] !== 'prediction') issues.push('La cabecera debe ser exactamente id,prediction.');
  if (/\r?\n$|\r$/.test(text) && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === '') rows.pop();
  const seen = new Set<string>();
  let invalid = 0, duplicates = 0;
  for (const row of rows) {
    if (row.length !== 2) { invalid++; continue; }
    const id = row[0].trim(), raw = row[1].trim(), value = Number(raw);
    if (!id || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) || !Number.isFinite(value) || value < -1 || value > 10) invalid++;
    if (seen.has(id)) duplicates++;
    seen.add(id);
  }
  if (invalid) issues.push(`${invalid} filas inválidas. Usa retornos decimales entre -1 y 10: 0.025 representa +2,5 %.`);
  if (duplicates) issues.push(`${duplicates} IDs repetidos.`);
  if (rows.length !== ids.length || seen.size !== ids.length || ids.some(id => !seen.has(id))) issues.push(`El archivo debe incluir exactamente los ${ids.length} IDs del live de esta ronda.`);
  return issues;
}
export const returnDate = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value));
export const returnDay = (value: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(`${value}T12:00:00-05:00`));
