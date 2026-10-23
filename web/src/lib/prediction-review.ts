import Papa from "papaparse";

export type CsvReview = { valid: boolean; rows: number; expected: number; duplicates: number; missing: number; unknown: number; invalid: number; constantEras: number; issues: string[] };

/** Solo datos públicos: esta revisión no calcula ni puede conocer el score. */
export function reviewPredictionCsv(text: string, index: [string, string][]): CsvReview {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {delimiter: ",", skipEmptyLines: false});
  const report: CsvReview = {valid: false, rows: 0, expected: index.length, duplicates: 0, missing: 0, unknown: 0, invalid: 0, constantEras: 0, issues: []};
  if (parsed.errors.length) report.issues.push("El CSV contiene comillas o filas mal formadas.");
  const rows = parsed.data;
  const header = rows.shift();
  if (header?.length !== 2 || header[0] !== "id" || header[1] !== "prediction") report.issues.push("La cabecera debe ser exactamente id,prediction.");
  // Un salto al final del archivo no crea una observación adicional.
  if (/\r?\n$|\r$/.test(text) && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop();
  const expected = new Map(index);
  const seen = new Set<string>();
  const eras = new Map<string, Set<number>>();
  report.rows = rows.length;
  for (const row of rows) {
    if (row.length !== 2) { report.invalid++; continue; }
    const id = row[0].trim();
    const raw = row[1].trim();
    const prediction = Number(raw);
    if (!id) report.invalid++;
    if (seen.has(id)) report.duplicates++;
    seen.add(id);
    const era = expected.get(id);
    if (era === undefined) report.unknown++;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) || !Number.isFinite(prediction) || prediction < 0 || prediction > 1) { report.invalid++; continue; }
    if (era !== undefined) {
      if (!eras.has(era)) eras.set(era, new Set());
      eras.get(era)!.add(prediction);
    }
  }
  report.missing = index.reduce((count, [id]) => count + (seen.has(id) ? 0 : 1), 0);
  report.constantEras = [...eras.values()].filter(values => values.size < 2).length;
  if (report.rows !== report.expected) report.issues.push(`Se esperan ${report.expected.toLocaleString("es-CO")} filas; el archivo contiene ${report.rows.toLocaleString("es-CO")}.`);
  if (report.duplicates) report.issues.push(`${report.duplicates} IDs repetidos.`);
  if (report.missing) report.issues.push(`${report.missing} IDs de esta ronda faltan.`);
  if (report.unknown) report.issues.push(`${report.unknown} IDs no pertenecen a esta ronda.`);
  if (report.invalid) report.issues.push(`${report.invalid} problemas de filas, IDs vacíos o números fuera del rango 0–1.`);
  if (report.constantEras) report.issues.push(`${report.constantEras} eras tienen predicciones constantes; necesitan al menos dos valores distintos.`);
  report.valid = report.issues.length === 0 && report.rows > 0;
  return report;
}

export function experimentHeader(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > 4096) throw new Error("La ficha supera 4 KB. Reduce los parámetros o la nota.");
  return btoa(String.fromCharCode(...bytes));
}
