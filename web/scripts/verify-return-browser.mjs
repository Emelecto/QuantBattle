// Production check using the dedicated technical account's ignored local session.
// No credentials or source prices are printed or included in the evidence report.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;

const root = fileURLToPath(new URL('../..', import.meta.url));
loadEnvConfig(path.join(root, 'web'));
const base = 'https://www.quantbattle.co';
const worker = process.env.NEXT_PUBLIC_WORKER_URL;
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const session = JSON.parse(await fs.readFile(path.join(root, 'worker/.return-pilot-session.json'), 'utf8'));
const launch = JSON.parse(await fs.readFile(path.join(root, 'artifacts/weekly-return-launch/production-check.json'), 'utf8'));
const response = await fetch(`${worker}/ml/return-rounds/${launch.round_id}/mine`, { headers: { Authorization: `Bearer ${session.access_token}` } });
if (!response.ok) throw new Error('Technical session receipt lookup failed');
const selected = (await response.json()).attempts.find(x => x.is_selected);
const browser = await chromium.launch();
const checks = {};
try {
  for (const kind of ['desktop', 'mobile']) {
    const context = await browser.newContext(kind === 'mobile' ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: `sb-${project}-auth-token`, value: JSON.stringify(session), url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/app/tournaments/weekly/${launch.week_id}`);
    await page.getByRole('heading', { name: /Retornos diarios.*semana del/ }).waitFor({ timeout: 90000 });
    await page.getByRole('heading', { name: /Ronda 1.*Recibiendo predicciones/ }).waitFor({ timeout: 90000 });
    checks[`${kind}_real_round_loaded`] = true;
    checks[`${kind}_four_rounds`] = await page.getByRole('navigation', { name: 'Elegir ronda' }).getByRole('button').count() === 4;
    checks[`${kind}_no_symbols_or_scores`] = await page.getByText('BTCUSDT', { exact: true }).count() === 0 && await page.getByRole('heading', { name: 'Un único cierre para todos los resultados' }).count() === 1;
    await page.getByLabel('CSV de retornos diarios').setInputFiles(path.join(root, 'artifacts/weekly-return-launch/predictions.csv'));
    await page.getByText('Archivo listo para validar en el servidor.').waitFor({ timeout: 90000 });
    checks[`${kind}_csv_review`] = true;
    if (kind === 'desktop') {
      const experiment = selected.experiment;
      await page.getByLabel('Nombre del modelo').fill(experiment.model_name);
      await page.getByLabel('Parámetros del modelo (JSON)').fill(JSON.stringify(experiment.parameters));
      await page.getByLabel('Semilla, si la utilizaste').fill(String(experiment.seed));
      await page.getByLabel('Nota del experimento').fill(experiment.note);
      await page.getByRole('button', { name: 'Validar y registrar predicciones' }).click();
      await page.getByText(/Predicciones validadas y seleccionadas/).waitFor({ timeout: 90000 });
      checks.desktop_real_upload_and_receipt = await page.getByText(`SHA-256: ${launch.file_sha256}`, { exact: true }).count() === 1;
    }
    await page.evaluate(() => scrollTo(0, 0));
    checks[`${kind}_no_overflow`] = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    checks[`${kind}_no_browser_errors`] = errors.length === 0;
    await page.screenshot({ path: path.join(root, `artifacts/weekly-return-launch/${kind}-production.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}
const report = { verified_at: new Date().toISOString(), site: base, week_id: launch.week_id, technical_account: true, checks };
await fs.writeFile(path.join(root, 'artifacts/weekly-return-launch/production-browser.json'), JSON.stringify(report, null, 2));
if (!Object.values(checks).every(Boolean)) throw new Error('A browser production check failed; inspect safe report');
console.log(JSON.stringify({ browser_checks_passed: Object.keys(checks).length }));
