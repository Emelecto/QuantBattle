import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

test("la portada clara conserva navegación y no desborda", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Crea modelos de machine learning.*aplicados en finanzas/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar torneos" }).first()).toHaveAttribute("href", "/app/tournaments");
  await expect(page.getByRole("link", { name: "Leer metodología y resultados" })).toHaveAttribute("href", "/docs#evaluacion");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("la vista del producto recorre el piloto con mouse, teclado y sin desbordar", async ({ page }) => {
  await page.goto("/");
  const preview = page.locator(".research-product-preview");
  await expect(preview).toHaveAttribute("data-preview-step", "0");
  await preview.getByRole("button", { name: "02 Modelo" }).click();
  await expect(preview).toHaveAttribute("data-preview-step", "1");
  await expect(preview.getByText("HistGradientBoostingRegressor")).toBeVisible();
  const send = preview.getByRole("button", { name: "03 Envío" });
  await send.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveAttribute("data-preview-step", "2");
  await expect(preview.getByText("Comprobante verificable")).toBeVisible();
  await preview.getByRole("button", { name: "04 Resultado" }).click();
  await expect(preview.locator(".research-preview-result-score")).toHaveText("0,006457");
  await expect(preview.getByRole("img", { name: /Correlación por era/ })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(preview.locator(".research-preview-state")).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("el dashboard comunica un fallo de datos sin inventar una ronda vacía", async ({ page }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;
  test.skip(!supabaseUrl || !workerUrl, "Requiere los hosts públicos configurados para simular respuestas");

  const supabaseHost = new URL(supabaseUrl!).hostname;
  const workerHost = new URL(workerUrl!).hostname;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001", role: "authenticated", aud: "authenticated", exp: expiresAt })).toString("base64url");
  const token = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", payload, "preview-signature"].join(".");
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "preview@quantbattle.example", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Vista técnica" }, created_at: "2026-10-01T00:00:00Z" };
  const session = { access_token: token, refresh_token: "preview-refresh", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user };
  await page.context().addCookies([{ name: `sb-${supabaseHost.split(".")[0]}-auth-token`, value: JSON.stringify(session), url: "http://localhost:3100" }]);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === supabaseHost) {
      if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
    }
    if (url.hostname === workerHost) return route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
    return route.continue();
  });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app");
  await page.getByRole("button", { name: "Saltar" }).click({ timeout: 3000 }).catch(() => {});
  await expect(page.getByText("Consulta no disponible", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Estado de las rondas no disponible.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resultado del piloto" })).toBeVisible();
  await page.getByRole("link", { name: /^(Mis envíos|Envíos)$/ }).click();
  await expect(page).toHaveURL(/\/app#historial-ml$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("acceso y registro usan el tema claro", async ({ page }) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.locator(".qb-auth-card")).toBeVisible();
    await expect(page.locator(".qb-auth-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("la lección y su quiz conservan contraste e interacción", async ({ page }) => {
  await page.goto("/app/academia/fundamentos/1");
  await expect(page.getByRole("heading", { name: "Edge y expectativa: el único juego que importa" })).toHaveCount(1);
  const questions = page.locator(".academia-quiz-q");
  await expect(questions.first()).toBeVisible();
  const firstOption = questions.first().locator(".academia-quiz-opt").first();
  await expect(firstOption).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await firstOption.click();
  await expect(firstOption).toHaveAttribute("data-state", "elegida");
  const count = await questions.count();
  for (let index = 1; index < count; index++) {
    await questions.nth(index).locator(".academia-quiz-opt").first().click();
  }
  await page.getByRole("button", { name: "Revisar respuestas" }).click();
  await expect(questions.first().getByText("Explicación:")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("los bloques de código no desbordan la lectura", async ({ page }) => {
  for (const path of ["/blog/walk-forward-oos", "/app/academia/python/1"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
