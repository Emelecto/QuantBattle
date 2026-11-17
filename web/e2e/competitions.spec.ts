import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
test.skip(process.env.QB_COMPETITIONS_FIXTURE !== "1", "Uses the isolated identity and API fixtures from playwright.competitions.config.ts");
test.setTimeout(60000);
const authOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const workerOrigin = process.env.NEXT_PUBLIC_WORKER_URL!;
const user = { id: "00000000-0000-0000-0000-000000000001", email: "demo@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const live = "id,feature_1\na,1\nb,2\n";
const digest = createHash("sha256").update(live).digest("hex");
const round = { id: "stocks-oc-2030-01-02", target_date: "2030-01-02", observation_date: "2030-01-01", deadline: "2030-01-02T14:00:00Z", status: "open", rows: 2, manifest_hash: digest, files: ["live.csv", "submission_template.csv"] };
const past = { ...round, id: "stocks-oc-2020-01-02", target_date: "2020-01-02", deadline: "2020-01-02T14:00:00Z", status: "settled" };

async function setup(page: Page) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", aud: "authenticated", exp: expires })).toString("base64url")}.test-signature`;
  await page.context().addCookies([{ name: "sb-127-auth-token", value: JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user }), url: "http://localhost:3135" }]);
  await page.route(`${authOrigin}/**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(route.request().url().includes("/auth/v1/user") ? user : []) }));
  await page.route(`${workerOrigin}/**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ rounds: [round, past], entries: [], attempts: [], has_more: false }) }));
}

test("catalog supports simultaneous rounds, filters and dedicated detail", async ({ page }, info) => {
  await setup(page);
  const second = { ...round, id: "stocks-oc-2030-01-03", target_date: "2030-01-03" };
  await page.route(`${workerOrigin}/ml/stock-rounds?*`, (route) => route.fulfill({ json: { rounds: [round, second, past] } }));
  await page.goto("/app/tournaments");
  await expect(page.getByRole("heading", { name: "Torneos", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver torneo" })).toHaveCount(3);
  await page.getByRole("button", { name: "Abiertos", exact: true }).click();
  await expect(page.getByRole("link", { name: "Ver torneo" })).toHaveCount(2);
  await page.getByRole("button", { name: "Finalizados", exact: true }).click();
  await expect(page.getByRole("link", { name: "Ver torneo" })).toHaveCount(1);
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.locator("body")).not.toContainText("Alpaca");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../artifacts/competitions-review/${info.project.name}-tournaments.png`, fullPage: true });
  await page.route(`${workerOrigin}/ml/stock-rounds/${round.id}?*`, (route) => route.fulfill({ json: { round } }));
  await page.locator(`a[href="/app/tournaments/${round.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(round.id));
  await expect(page.getByLabel("CSV de predicciones de acciones")).toBeVisible();
});

test("detail retains verified downloads, upload validation and closed-round guard", async ({ page }) => {
  await setup(page);
  let corrupt = false;
  let submitted = false;
  await page.route(`${workerOrigin}/ml/stock-rounds/${round.id}?*`, (route) => route.fulfill({ json: { round } }));
  await page.route(`${workerOrigin}/ml/stock-rounds/${round.id}/download/live.csv?*`, (route) => route.fulfill({ json: { url: "https://download.invalid/live.csv", sha256: corrupt ? "0".repeat(64) : digest } }));
  await page.route("https://download.invalid/live.csv", (route) => route.fulfill({ contentType: "text/csv", body: live }));
  await page.route(`${workerOrigin}/ml/stock-rounds/${round.id}/mine?*`, (route) => route.fulfill({ json: { attempts: submitted ? [{ id: "new", submitted_at: "2026-11-15T14:00:00Z", row_count: 2, is_selected: true, file_sha256: digest, status: "validated" }] : [] } }));
  await page.route(`${workerOrigin}/ml/stock-rounds/${round.id}/predictions?*`, (route) => {
    const valid = route.request().postData()?.includes("a,0");
    submitted = Boolean(valid);
    return route.fulfill({ status: valid ? 200 : 422, json: valid ? { submission: { id: "new" } } : { detail: "Faltan predicciones de la ronda" } });
  });
  await page.goto(`/app/tournaments/${round.id}`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar live.csv", exact: true }).click();
  await download;
  corrupt = true;
  await page.getByRole("button", { name: "Descargar live.csv", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "huella" })).toBeVisible();
  await page.getByLabel("CSV de predicciones de acciones").setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("id,prediction\nb,0\n") });
  await page.getByRole("button", { name: "Enviar predicciones", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Faltan predicciones" })).toBeVisible();
  await page.getByLabel("CSV de predicciones de acciones").setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from("id,prediction\na,0\nb,0\n") });
  await page.getByRole("button", { name: "Enviar predicciones", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Predicciones registradas");
  await expect(page.getByText(/2 filas · Seleccionado/)).toBeVisible();
  await page.route(`${workerOrigin}/ml/stock-rounds/${past.id}?*`, (route) => route.fulfill({ json: { round: past } }));
  await page.goto(`/app/tournaments/${past.id}`);
  await expect(page.getByRole("heading", { name: "Ronda evaluada" })).toBeVisible();
  await expect(page.getByLabel("CSV de predicciones de acciones")).toHaveCount(0);
});

test("history uses private receipts, status/date filters, paging and recoverable errors", async ({ page }, info) => {
  await setup(page);
  let fail = false;
  const history = [
    { id: "latest", round, round_status: "open", row_count: 2, submitted_at: "2026-11-15T14:00:00Z", is_selected: true, file_sha256: digest, status: "validated" },
    { id: "previous", round, round_status: "open", row_count: 2, submitted_at: "2026-11-14T14:00:00Z", is_selected: false, file_sha256: digest, status: "validated" },
    { id: "scored", round: past, round_status: "settled", row_count: 2, submitted_at: "2020-01-01T14:00:00Z", is_selected: true, file_sha256: digest, score: 0, mae: .02, status: "scored" },
  ];
  await page.route(`${workerOrigin}/ml/stock-submissions/mine?*`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (fail) return route.fulfill({ status: 503, json: { detail: "unavailable" } });
    let entries = history;
    if (query.get("state") === "pending") entries = entries.filter((e) => e.is_selected && e.round_status !== "settled");
    if (query.get("state") === "evaluated") entries = entries.filter((e) => e.round_status === "settled");
    if (query.get("state") === "previous") entries = entries.filter((e) => !e.is_selected);
    return route.fulfill({ json: { entries: query.get("offset") === "20" ? [] : entries, has_more: query.get("offset") !== "20" } });
  });
  await page.goto("/app/submissions");
  await expect(page.getByRole("heading", { name: "Mis envíos", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Envío latest", exact: true })).toBeVisible();
  await expect(page.getByText("0.0000", { exact: true })).toBeVisible();
  const first = page.getByRole("article", { name: "Envío latest", exact: true });
  await first.getByRole("button", { name: "Ver detalle" }).click();
  await expect(first.getByText(digest)).toBeVisible();
  await page.screenshot({ path: `../artifacts/competitions-review/${info.project.name}-submissions.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "En evaluación", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "En evaluación", exact: true }).click();
  await expect(first).toBeVisible();
  await page.getByLabel("Fecha de envío", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("No hay envíos con estos filtros")).toBeVisible();
  await page.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(first).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Evaluados", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos cargar" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("article", { name: "Envío scored", exact: true })).toBeVisible();
});

test("navigation separates home and submissions and keeps old bookmarks working", async ({ page }) => {
  await setup(page);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Tu actividad", exact: true })).toBeVisible();
  await expect(page.locator("#stock-history")).toHaveCount(0);
  await expect(page.locator("#historial-ml")).toHaveCount(0);
  await page.getByRole("link", { name: /^(Mis envíos|Envíos)$/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/submissions$/);
  await page.goto("/app#historial-ml");
  await expect(page).toHaveURL(/\/app\/submissions$/);
});

test("new protected routes reject anonymous access", async ({ request }) => {
  for (const path of ["/app/submissions", `/app/tournaments/${round.id}`]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
  }
});

test("catalog distinguishes failed loading from a confirmed empty schedule", async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route(`${workerOrigin}/ml/stock-rounds?*`, (route) => route.fulfill({ status: fail ? 503 : 200, json: fail ? { detail: "unavailable" } : { rounds: [], has_more: false } }));
  await page.goto("/app/tournaments");
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos cargar" })).toBeVisible();
  await expect(page.getByText("Aún no hay torneos publicados")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aún no hay torneos publicados" })).toBeVisible();
});

test("catalog loads older rounds without losing existing cards", async ({ page }) => {
  await setup(page);
  await page.route(`${workerOrigin}/ml/stock-rounds?*`, (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
    return route.fulfill({ json: { rounds: offset ? [past] : [round], has_more: !offset } });
  });
  await page.goto("/app/tournaments");
  await expect(page.getByRole("link", { name: "Ver torneo" })).toHaveCount(1);
  await page.getByRole("button", { name: "Cargar más torneos" }).click();
  await expect(page.getByRole("link", { name: "Ver torneo" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Cargar más torneos" })).toHaveCount(0);
});
