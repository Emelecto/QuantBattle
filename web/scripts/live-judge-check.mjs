// Prueba de interfaz con la cuenta técnica. Requiere autorización explícita
// por variable de entorno; reemplaza solo su envío de la ronda sintética semanal.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.QL_ENABLE_LIVE_UI_TEST !== "true") throw new Error("Activar QL_ENABLE_LIVE_UI_TEST=true para esta prueba con servicios reales");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(resolve(root, "artifacts/judge-pilot/manifest.json"), "utf8"));
const receipt = JSON.parse(await readFile(resolve(root, "artifacts/weekly-reference/receipt.json"), "utf8"));
const base = process.env.QL_UI_BASE_URL || "https://quant-lab-nine.vercel.app";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(32).toString("base64url");
const updated = await admin.auth.admin.updateUserById(manifest.user_id, { password });
if (updated.error) throw updated.error;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(45_000);
  await page.goto(`${base}/login`);
  if (new URL(page.url()).origin !== new URL(base).origin) throw new Error("El entorno de prueba redirigió a otro host");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("technical-demo@quantlab.example");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.waitForURL(/\/app(?:\/|$)/);
  console.log("browser_login_ok");
  await page.goto(`${base}/app/tournaments/61079ded-94e1-4b5d-9434-28492234acc6`, { waitUntil: "domcontentloaded" });
  console.log("tournament_page_loaded", new URL(page.url()).pathname);
  await page.getByRole("tab", { name: "Enviar", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(resolve(root, "artifacts/weekly-reference/predictions.csv"));
  console.log("csv_selected");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/ml/datasets/${receipt.dataset_id}/predictions`) && r.request().method() === "POST"),
    page.getByRole("button", { name: "Validar y registrar envío" }).click(),
  ]);
  if (response.status() !== 200) throw new Error(`La interfaz recibió HTTP ${response.status()}`);
  const submission = (await response.json()).submission;
  if (!submission.is_selected || submission.status !== "validated" || submission.row_count !== 42000) throw new Error("Recibo no válido");
  await page.getByText("Validado; esperando cierre", { exact: true }).waitFor();
  const output = resolve(root, "artifacts/judge-ui");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "authenticated-upload.png"), fullPage: true });
  const result = { completed_at: new Date().toISOString(), base_url: base, technical_account: true, external_participants: 0, checks: { browser_login: true, csv_upload_from_browser: true, selected_receipt_visible: true }, dataset_id: receipt.dataset_id, row_count: submission.row_count, file_sha256: submission.file_sha256 };
  await writeFile(resolve(output, "live-ui.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  const output = resolve(root, "artifacts/judge-ui");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "live-ui-failure.png"), fullPage: true });
  console.error("failure_path", new URL(page.url()).pathname);
  console.error((await page.locator("body").innerText()).slice(0, 3000));
  throw error;
} finally {
  await browser.close();
}
