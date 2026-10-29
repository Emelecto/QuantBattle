import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { reviewReturnCsv } from '../src/lib/returnTournaments';

const weekId = '10000000-0000-4000-8000-000000000001';
const ids = Array.from({ length: 32 }, (_, i) => `anonymous${i.toString().padStart(3, '0')}`);
const version = 'dr1-browser-contract-test';
const rounds = Array.from({ length: 4 }, (_, i) => ({
  id: `20000000-0000-4000-8000-00000000000${i + 1}`, ordinal: i + 1,
  observation_day: `2026-10-${25 + i}`, submission_day: `2026-10-${26 + i}`, target_day: `2026-10-${27 + i}`,
  opens_at: `2026-10-${26 + i}T00:30:00-05:00`, closes_at: `2026-10-${27 + i}T00:00:00-05:00`,
  target_start: `2026-10-${27 + i}T00:00:00-05:00`, target_end: `2026-10-${28 + i}T00:00:00-05:00`,
  status: i === 0 ? 'open' : 'scheduled', version: i === 0 ? version : null,
  dataset: i ? null : { source_commitment: 'a'.repeat(64), asset_count: 32, files: Object.fromEntries(['train', 'validation', 'live'].map(kind => [kind, { rows: kind === 'live' ? 32 : 3200, url: `/ml/test-${kind}.parquet`, hash: 'b'.repeat(64), columns: [] }])) },
}));
const week = { id: weekId, name: 'Retornos diarios · semana del 2026-10-26', week_start: '2026-10-26', asset_count: 32, timezone: 'America/Bogota', protocol: 'daily_return_mae_v1', status: 'open', results_released: false, release_at: '2026-10-31T00:30:00-05:00', rounds };

async function mockedSession(page: Page, published = false) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;
  test.skip(!supabaseUrl || !workerUrl, 'Requires public hosts for API contract mocks');
  const host = new URL(supabaseUrl!).hostname, worker = new URL(workerUrl!).hostname;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'contract@quantbattle.example', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Prueba técnica' }, created_at: '2026-10-01T00:00:00Z' };
  const token = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires })).toString('base64url'), 'test-signature'].join('.');
  await page.context().addCookies([{ name: `sb-${host.split('.')[0]}-auth-token`, value: JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user }), url: 'http://localhost:3100' }]);
  let attempts: Record<string, unknown>[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.hostname === host) return json(url.pathname.endsWith('/auth/v1/user') ? user : {}, url.pathname.endsWith('/auth/v1/user') ? 200 : 400);
    if (url.hostname !== worker) return route.continue();
    if (url.pathname === `/ml/return-tournaments/${weekId}`) return json(published ? { ...week, status: 'published', results_released: true, results_url: '/research/test-final.json', rounds: rounds.map(r => ({ ...r, status: 'published' })) } : week);
    if (url.pathname.endsWith('/rows')) return json({ round_id: rounds[0].id, version, ids });
    if (url.pathname.endsWith('/mine')) return json({ attempts });
    if (url.pathname.endsWith('/predictions')) {
      const raw = route.request().postDataBuffer()!;
      const sub = { id: 'receipt-1', round_id: rounds[0].id, file_sha256: createHash('sha256').update(raw).digest('hex'), dataset_version: version, row_count: 32, submitted_at: '2026-10-26T12:00:00-05:00', is_selected: true, status: 'validated' };
      attempts = [sub];
      return json({ submission: sub });
    }
    if (url.pathname.endsWith('/results')) return json({ results_sha256: 'd'.repeat(64), leaderboard: [], evidence: { rounds: [{ id: rounds[0].id, ordinal: 1, target_day: '2026-10-27', status: 'settled', assets: [{ id: ids[0], symbol: 'BTCUSDT', open: 100, close: 102, return: .02 }] }] } });
    return json({}, 400);
  });
}

test('daily return CSV accepts signed values and zero while rejecting wrong coverage', () => {
  expect(reviewReturnCsv('id,prediction\na,-0.025\nb,0\n', ['a', 'b'])).toEqual([]);
  expect(reviewReturnCsv('id,prediction\na,inf\nb,0\n', ['a', 'b']).length).toBeGreaterThan(0);
  expect(reviewReturnCsv('id,prediction\na,0\na,0\n', ['a', 'b']).length).toBeGreaterThan(0);
});

test('four daily rounds preserve private results and accept a return CSV with receipt', async ({ page }, info) => {
  await mockedSession(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/app/tournaments/weekly/${weekId}`);
  await expect(page.getByRole('heading', { name: week.name })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Elegir ronda' }).getByRole('button')).toHaveCount(4);
  await expect(page.getByText('BTCUSDT')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Un único cierre para todos los resultados' })).toBeVisible();
  const input = page.getByLabel('CSV de retornos diarios');
  await input.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('id,prediction\nwrong,0\n') });
  await expect(page.getByText(/El archivo debe incluir exactamente/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validar y registrar predicciones' })).toBeDisabled();
  const raw = 'id,prediction\n' + ids.map((id, i) => `${id},${i % 2 ? -0.02 : 0}`).join('\n') + '\n';
  await input.setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(raw) });
  await expect(page.getByText('Archivo listo para validar en el servidor.')).toBeVisible();
  await page.getByLabel('Nombre del modelo').fill('Modelo técnico de prueba');
  await page.getByRole('button', { name: 'Validar y registrar predicciones' }).click();
  await expect(page.getByText(/Predicciones validadas y seleccionadas/)).toBeVisible();
  await expect(page.getByText(`SHA-256: ${createHash('sha256').update(raw).digest('hex')}`)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const lastRound = await page.getByRole('navigation', { name: 'Elegir ronda' }).getByRole('button').nth(3).boundingBox();
  expect(lastRound!.y + lastRound!.height).toBeLessThan(page.viewportSize()!.height - (info.project.name === 'mobile' ? 70 : 0));
  await page.screenshot({ path: `../artifacts/weekly-return-ui/${info.project.name}.png`, fullPage: true });
  await page.screenshot({ path: `../artifacts/weekly-return-ui/${info.project.name}-viewport.png` });
  await page.getByRole('button', { name: /Ronda 2/ }).click();
  await expect(page.getByLabel('CSV de retornos diarios')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('real prices are shown only for a fully published tournament', async ({ page }) => {
  await mockedSession(page, true);
  await page.goto(`/app/tournaments/weekly/${weekId}`);
  await expect(page.getByRole('heading', { name: 'Resultados y precios reales' })).toBeVisible();
  await page.getByText(/Ronda 1.*precios y retornos/).click();
  await expect(page.getByRole('cell', { name: 'BTCUSDT' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Un único cierre para todos los resultados' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
