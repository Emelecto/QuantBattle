import { call } from "@/lib/tournaments";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
export type Protocol = "daily_return_mae_v1" | "spearman_era_v1";
export const protocolLabel = (p: string) =>
  p === "daily_return_mae_v1"
    ? "Retornos · MAE"
    : "Práctica sintética · Spearman";
export type MLProject = {
  id: string;
  title: string;
  hypothesis: string;
  protocol: Protocol;
  updated_at: string;
  parent_publication_id?: string;
};
export type VersionSnapshot = {
  model_name: string;
  parameters: Record<string, unknown>;
  seed: number | null;
  note: string;
  dataset_version: string;
  validation_mae: number | null;
  validation_spearman: number | null;
  dependencies: string;
  hypothesis: string;
  protocol: Protocol;
};
export type MLVersion = {
  id: string;
  project_id: string;
  snapshot: VersionSnapshot;
  notebook_sha256: string | null;
  created_at: string;
};
export type ProjectDetail = {
  project: MLProject;
  versions: MLVersion[];
  submissions: {
    id: string;
    version_id: string;
    submission_id: string;
    created_at: string;
  }[];
};
export type MLPublication = {
  id: string;
  title: string;
  author_name?: string;
  checks?: {
    notebook_format: boolean;
    environment_declared: boolean;
    content_reviewed: boolean;
    execution_verified: boolean;
  };
  protocol: Protocol;
  description: string;
  limitations: string;
  license: string;
  snapshot: Pick<
    VersionSnapshot,
    | "model_name"
    | "parameters"
    | "seed"
    | "dependencies"
    | "protocol"
    | "hypothesis"
  >;
  notebook_sha256: string;
  status: string;
  review_note?: string;
  created_at: string;
  can_review?: boolean;
  can_withdraw?: boolean;
};
export type Progress = {
  checkpoints: string[];
  passed_missions: string[];
  has_submission: boolean;
  attempts: { mission: string; result: MissionResult }[];
};
export type Mission = {
  id: string;
  title: string;
  prompt: string;
  kind: "choice" | "predictions";
  version: number;
  lesson: string;
  options?: string[];
  train?: { id: string; feature: number; target: number }[];
  validation?: { id: string; feature: number }[];
};
export type MissionResult = {
  passed: boolean;
  explanation: string;
  mae?: number;
  baseline_mae?: number;
};
export type ErrorReport = {
  round_id: string;
  submission_id: string;
  dataset_version: string;
  file_sha256: string;
  mae: number;
  score: number;
  baseline_mae: number;
  mean_signed_error: number;
  limitations: string;
  assets: {
    id: string;
    symbol: string;
    actual: number;
    prediction: number;
    error: number;
    absolute_error: number;
  }[];
  exercises: { question: string; answer: string; lesson: string }[];
};
const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});
export const projectList = (offset = 0) =>
  call<{ entries: MLProject[]; has_more: boolean }>(
    `/ml/projects?offset=${offset}`,
  );
export const createProject = (body: {
  title: string;
  hypothesis: string;
  protocol: Protocol;
}) => call<MLProject>("/ml/projects", post(body));
export const getProject = (id: string) =>
  call<ProjectDetail>(`/ml/projects/${id}`);
export const updateProject = (id: string, body: unknown) =>
  call(`/ml/projects/${id}`, { ...post(body), method: "PATCH" });
export const addVersion = (id: string, body: unknown) =>
  call<MLVersion>(`/ml/projects/${id}/versions`, post(body));
export const linkSubmission = (
  id: string,
  version_id: string,
  submission_id: string,
) =>
  call(`/ml/projects/${id}/submissions`, post({ version_id, submission_id }));
export const publishProject = (id: string, body: unknown) =>
  call<MLPublication>(`/ml/projects/${id}/publish`, post(body));
export const notebookList = (offset = 0) =>
  call<{ entries: MLPublication[]; has_more: boolean }>(
    `/ml/notebooks?offset=${offset}`,
  );
export const myNotebooks = () =>
  call<{ entries: MLPublication[] }>("/ml/notebooks/mine");
export const getNotebook = (id: string) =>
  call<MLPublication>(`/ml/notebooks/${id}`);
export const forkNotebook = (id: string) =>
  call<MLProject>(`/ml/notebooks/${id}/fork`, post({}));
export const reviewQueue = () =>
  call<{ entries: MLPublication[] }>("/ml/notebooks-review/queue");
export const reviewNotebook = (id: string, status: string, note: string) =>
  call(`/ml/notebooks/${id}/review`, post({ status, note }));
export const withdrawNotebook = (id: string) =>
  call(`/ml/notebooks/${id}`, { method: "DELETE" });
export const getProgress = () => call<Progress>("/ml/learning/progress");
export const markCheckpoint = (step: string) =>
  call("/ml/learning/checkpoints", post({ step }));
export const getMissions = () =>
  call<{ missions: Mission[] }>("/ml/learning/missions");
export const sendMission = (id: string, answer: unknown) =>
  call<MissionResult>(`/ml/learning/missions/${id}/attempts`, post(answer));
export const getErrorReport = (id: string) =>
  call<ErrorReport>(`/ml/learning/error-lab/${id}`);
export function downloadJSON(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadNotebook(path: string) {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session)
    headers.Authorization = `Bearer ${data.session.access_token}`;
  const base =
    process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, "") ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:8001" : "");
  if (!base)
    throw new Error(
      "La conexión con el servicio de notebooks no está configurada.",
    );
  const response = await fetch(base + path, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      "No se pudo descargar el notebook. Comprueba tu sesión y vuelve a intentarlo.",
    );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "quantlab-metodo.ipynb";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
