import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

test.setTimeout(60_000);
const quiz = JSON.parse(readFileSync("content/cursos/fundamentos/quizzes/c1_l1.json", "utf8")) as {
  questions: { options: string[]; answer: number }[];
};
const userId = "00000000-0000-4000-8000-000000000011";
const runId = "00000000-0000-4000-8000-000000000012";

async function session(page: Page, workerHandler?: (route: Route, path: string) => Promise<void> | undefined) {
  const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  const workerHost = new URL(process.env.NEXT_PUBLIC_WORKER_URL!).hostname;
  const user = { id: userId, email: "browser-contract@example.invalid", aud: "authenticated", role: "authenticated",
    user_metadata: {}, app_metadata: { provider: "email" }, created_at: "2026-10-01T00:00:00Z" };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", Buffer.from(JSON.stringify({ sub: userId, exp: expires, aud: "authenticated", role: "authenticated" })).toString("base64url"), "contract-signature"].join(".");
  await page.context().addCookies([{ name: `sb-${supabaseHost.split(".")[0]}-auth-token`,
    value: JSON.stringify({ access_token: token, refresh_token: "contract-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user }), url: "http://localhost:3100" }]);
  await page.addInitScript(() => localStorage.setItem("ql_onboarded", "1"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.hostname === supabaseHost) return json(url.pathname.endsWith("/auth/v1/user") ? user : []);
    if (url.pathname === "/api/market") return json({ closes: [], times: [] });
    if (url.hostname !== workerHost) return route.continue();
    const handled = workerHandler?.(route, url.pathname);
    if (handled) return handled;
    if (url.pathname === "/tokens/balance") return json({ balance: 0, lifetime_earned: 0, lifetime_spent: 0, tier: "free" });
    if (url.pathname === "/ml/return-tournaments") return json({ tournaments: [] });
    return json({});
  });
  return { errors, token };
}

test("Academia guarda el quiz y continúa en la siguiente lección", async ({ page }) => {
  const { errors } = await session(page);
  await page.goto("/app/academia/fundamentos/1");
  for (const [i, question] of quiz.questions.entries()) {
    await page.locator(".academia-quiz-q").nth(i).getByRole("button", { name: question.options[question.answer], exact: true }).click();
  }
  await page.getByRole("button", { name: "Revisar respuestas", exact: true }).click();
  await expect(page.locator(".academia-quiz-score")).toHaveText(`Aciertos: ${quiz.questions.length}/${quiz.questions.length}`);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("quantlab.academia.v1") || "{}").completed)).toContain("c1-l1");
  await page.goto("/app/academia/fundamentos");
  await expect(page.locator(".academia-progress-text")).toContainText("1/7 lecciones");
  await page.reload();
  await expect(page.locator(".academia-progress-text")).toContainText("1/7 lecciones");
  expect(errors).toEqual([]);
});

test("Academia permite reintentar y no concede progreso por respuestas incorrectas", async ({ page }) => {
  let awards = 0;
  await session(page, (route, path) => {
    if (path.includes("/tokens/earn")) { awards++; return route.fulfill({ status: 200, body: "{}" }); }
  });
  await page.goto("/app/academia/fundamentos/1");
  for (const [i, question] of quiz.questions.entries()) await page.locator(".academia-quiz-q").nth(i).getByRole("button").nth((question.answer + 1) % question.options.length).click();
  await page.getByRole("button", { name: "Revisar respuestas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("quantlab.academia.v1"))).toBeNull();
  expect(awards).toBe(0);
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revisar respuestas", exact: true })).toBeDisabled();
});

test("el progreso del curso excluye duplicados e identificadores desconocidos", async ({ page }) => {
  await session(page);
  await page.addInitScript(() => localStorage.setItem("quantlab.academia.v1", JSON.stringify({ completed: ["c1-l1", "c1-l1", "unknown", "c2-l1"], perfect: ["c1-l1", "c1-l1", "unknown"] })));
  await page.goto("/app/academia/fundamentos");
  await expect(page.locator(".academia-progress-text")).toHaveText("1/7 lecciones · 1 QP ganados");
});

test("backtesting envía la sesión, guarda el resultado propio y lo recupera", async ({ page }) => {
  let executed = 0;
  let authorization = "";
  const { errors, token } = await session(page, (route, path) => {
    if (path === "/backtest/validate") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true, warnings: [] }) });
    if (path === "/backtest") {
      executed++;
      authorization = route.request().headers().authorization;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: runId, metrics: { sharpe_is: 0.8, sharpe_oos: 0.4, deflated_sharpe_oos: 0.2, sortino: 0.5, maxdd: -0.1, winrate: 0.5, n_trades: 12, ret_total: 0.03, vol: 0.2 }, integrity_label: "High", equity_curve: [{ t: "2026-01-01", is: 1000, oos: 1000 }, { t: "2026-01-02", is: 1030, oos: 1030 }], report: "Resultado técnico simulado" }) });
    }
  });
  await page.goto("/app/backtesting/new?demo=1");
  await expect(page.getByLabel("Desde", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Ejecutar backtest OOS", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/strategies/${runId}/results$`));
  expect(executed).toBe(1);
  expect(authorization).toBe(`Bearer ${token}`);
  await page.reload();
  await expect(page.getByText("Resultado técnico simulado")).toBeVisible();
  expect(errors).toEqual([]);
});

test("un fallo de validación no se transforma en validación aprobada", async ({ page }) => {
  let executed = 0;
  await session(page, (route, path) => {
    if (path === "/backtest/validate") return route.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"No autenticado"}' });
    if (path === "/backtest") { executed++; return route.fulfill({ status: 500, body: "{}" }); }
  });
  await page.goto("/app/backtesting/new?demo=1");
  await page.getByRole("button", { name: "Ejecutar backtest OOS", exact: true }).click();
  await expect(page.getByText("Tu sesión ha expirado. Inicia sesión de nuevo.")).toBeVisible();
  expect(executed).toBe(0);
});
