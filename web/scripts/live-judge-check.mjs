// Prueba de interfaz con la cuenta técnica. Requiere autorización explícita
// por variable de entorno; reemplaza solo su envío de la ronda sintética semanal.
import { chromium, expect } from "@playwright/test";
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
await page.addInitScript(() => localStorage.setItem("ql_onboarded", "1"));
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
  let predictionPosts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/predictions")) predictionPosts++; });
  await page.locator('input[type="file"]').setInputFiles({name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("id,prediction\nunknown,NaN\n")});
  await expect(page.getByText("Corrige el archivo antes de enviarlo",{exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByRole("button",{name:"Validar y registrar envío"})).toBeDisabled();
  if(predictionPosts !== 0) throw new Error("Un CSV rechazado localmente llegó al endpoint de envío");
  await page.locator('input[type="file"]').setInputFiles(resolve(root, "artifacts/weekly-reference/predictions.csv"));
  console.log("csv_selected");
  await expect(page.getByText("Archivo listo para validar en el servidor",{exact:true})).toBeVisible({timeout:60000});
  await page.getByLabel("Nombre del modelo",{exact:true}).fill("HistGradientBoostingRegressor · referencia técnica");
  await page.getByLabel("Parámetros (JSON)",{exact:true}).fill(JSON.stringify({max_leaf_nodes:7,max_iter:100,learning_rate:0.05,l2_regularization:1.0}));
  await page.getByLabel("Semilla (opcional)",{exact:true}).fill("42");
  await page.getByLabel("Nota del experimento",{exact:true}).fill("Modelo técnico del proyecto: entrenado con train; configuración seleccionada con validation. No utiliza target de live.");
  await mkdir(resolve(root,"artifacts/ml-workspace"),{recursive:true});
  await page.getByRole("region",{name:"Revisión previa del CSV"}).screenshot({path:resolve(root,"artifacts/ml-workspace/csv-review.png")});
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/ml/datasets/${receipt.dataset_id}/predictions`) && r.request().method() === "POST"),
    page.getByRole("button", { name: "Validar y registrar envío" }).click(),
  ]);
  if (response.status() !== 200) throw new Error(`La interfaz recibió HTTP ${response.status()}`);
  // La UI ya consume el cuerpo. Leer el recibo persistido evita depender de
  // la caché del inspector del navegador al subir archivos grandes.
  await page.getByText("Validado; esperando cierre", { exact: true }).waitFor();
  const saved = await admin.from("prediction_submissions").select("status,is_selected,row_count,file_sha256,submitted_at")
    .eq("dataset_id", receipt.dataset_id).eq("user_id", manifest.user_id).eq("is_selected", true).single();
  if (saved.error) throw saved.error;
  const submission = saved.data;
  if (!submission.is_selected || submission.status !== "validated" || submission.row_count !== 42000) throw new Error("Recibo no válido");
  if (submission.file_sha256 !== receipt.receipt.file_sha256) throw new Error("La huella del comprobante no coincide");
  const output = resolve(root, "artifacts/judge-ui");
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, "authenticated-upload.png"), fullPage: true });
  await page.goto(`${base}/app#historial-ml`);
  await expect(page.getByRole("heading",{name:"Mi investigación ML"})).toBeVisible();
  await expect(page.getByText("HistGradientBoostingRegressor · referencia técnica",{exact:true}).first()).toBeVisible({timeout:60000});
  await page.locator("#historial-ml details summary").first().click();
  await expect(page.getByText("Parámetros declarados",{exact:true}).first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Descargar esta página (JSON)"}).click()]);
  const exported = JSON.parse(await readFile(await download.path(),"utf8"));
  const experiment = exported.entries.find(entry=>entry.dataset_id===receipt.dataset_id && entry.is_selected);
  if(!experiment || experiment.score !== null || experiment.experiment?.seed !== 42 || experiment.experiment.parameters.max_leaf_nodes !== 7 || experiment.file_sha256 !== submission.file_sha256)throw new Error("El historial exportado no reproduce la ficha privada del envío");
  await page.screenshot({path:resolve(root,"artifacts/ml-workspace/desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(root,"artifacts/ml-workspace/mobile.png"),fullPage:true});
  const overflows=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
  if(overflows)throw new Error("El espacio ML desborda en móvil");
  const result = { completed_at: new Date().toISOString(), base_url: base, technical_account: true, external_participants: 0, checks: { browser_login: true, csv_upload_from_browser: true, selected_receipt_visible: true, invalid_csv_blocked_before_upload: true, experiment_saved_and_exported: true, live_score_hidden: true, mobile_workspace_no_overflow: true }, dataset_id: receipt.dataset_id, row_count: submission.row_count, file_sha256: submission.file_sha256 };
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
