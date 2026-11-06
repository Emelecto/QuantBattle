import { call } from "@/lib/tournaments";
export type StockRound = {
  id: string;
  target_date: string;
  observation_date: string;
  deadline: string;
  status: "open" | "closed" | "settled";
  rows: number;
  manifest_hash: string;
  files: string[];
};
export type StockReceipt = {
  id: string;
  row_count: number;
  submitted_at: string;
  is_selected: boolean;
  status: string;
  file_sha256: string;
  score?: number | null;
  mae?: number | null;
};
export const listStockRounds = () =>
  call<{ rounds: StockRound[] }>("/ml/stock-rounds", undefined, {
    timeoutMs: 25000,
    maxAttempts: 1,
  });
export const stockReceipts = (id: string) =>
  call<{ attempts: StockReceipt[] }>(
    `/ml/stock-rounds/${encodeURIComponent(id)}/mine`,
  );
export const submitStockFile = (id: string, file: File) =>
  call<{ submission: StockReceipt }>(
    `/ml/stock-rounds/${encodeURIComponent(id)}/predictions`,
    { method: "POST", headers: { "Content-Type": "text/csv" }, body: file },
  );
export async function downloadStockFile(id: string, filename: string) {
  const metadata = await call<{ url: string; sha256: string }>(
    `/ml/stock-rounds/${encodeURIComponent(id)}/download/${encodeURIComponent(filename)}`,
  );
  const response = await fetch(metadata.url, {
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("No se pudo descargar el archivo. Vuelve a intentarlo.");
  const bytes = await response.arrayBuffer();
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== metadata.sha256)
    throw new Error(
      "La huella del archivo no coincide. No utilizaremos esta descarga; vuelve a intentarlo.",
    );
  const url = URL.createObjectURL(new Blob([bytes]));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${id}-${filename}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
