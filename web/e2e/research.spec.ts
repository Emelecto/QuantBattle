import { expect, test } from "@playwright/test";

test("los pagos del piloto están cerrados y no generan checkout", async ({ request }) => {
  const response = await request.post("/api/stripe/checkout", { data: { plan: "plus" } });
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.error).toContain("no tiene pagos habilitados");
  expect(body.url).toBeUndefined();
});

test("un evaluador encuentra el protocolo y la evidencia desde la portada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Leer metodología y resultados" }).click();
  await expect(page).toHaveURL(/\/docs#evaluacion$/);
  await expect(page.getByRole("heading", { name: "Evaluación técnica con datos sintéticos" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Spearman medio por era sobre el holdout sintético" })).toBeVisible();
});

test("la evidencia descargable identifica la prueba artificial y sus resultados", async ({ request }) => {
  const response = await request.get("/research/judge-pilot.json");
  expect(response.ok()).toBeTruthy();
  const evidence = await response.json();
  expect(evidence.status).toBe("completed");
  expect(evidence.synthetic).toBe(true);
  expect(evidence.external_participants).toBe(0);
  expect(Object.values(evidence.checks).every(Boolean)).toBe(true);
  expect(evidence.results.model.n_eras).toBeGreaterThanOrEqual(10);
  expect(Number.isFinite(evidence.results.model.score)).toBe(true);
  expect(JSON.stringify(evidence)).not.toMatch(/service_role|access_token|password/);
});

test("la documentación se lee sin desbordamiento y el notebook se descarga", async ({ page, request }, testInfo) => {
  await page.goto("/docs#evaluacion");
  await expect(page.getByRole("link", { name: "Descargar notebook reproducible" })).toBeAttached();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  const notebook = await request.get("/ml/ejemplo_quantbattle.ipynb");
  expect(notebook.ok()).toBe(true);
  expect((await notebook.json()).nbformat).toBe(4);
  await page.locator("#evaluacion").screenshot({ path: `../artifacts/judge-ui/${testInfo.project.name}.png` });
});

test("la demo conduce a evidencia ML y las funciones identifican datos sintéticos", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/docs#evaluacion$/);
  await page.goto("/features");
  await expect(page.getByRole("heading",{name:"Rondas de predicción ML"})).toBeVisible();
  await expect(page.getByText(/activos artificiales/)).toBeVisible();
  await expect(page.getByRole("link",{name:"Ver evaluación técnica",exact:true})).toHaveAttribute("href","/docs#evaluacion");
});

test("el estado comunica el alcance real de la consulta de salud", async ({ page }) => {
  await page.route("**/health", route=>route.fulfill({status:200,contentType:"application/json",body:'{"status":"ok"}'}));
  await page.goto("/status");
  await expect(page.getByText("Operativo",{exact:true})).toBeVisible();
  await expect(page.getByText(/no verifica la base de datos/)).toBeVisible();
  await expect(page.getByRole("link",{name:"Consultar evidencia técnica"})).toBeVisible();
});
