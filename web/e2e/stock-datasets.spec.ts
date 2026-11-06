import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

async function login(page: Page) {
  test.skip(
    !process.env.QB_TEST_EMAIL || !process.env.QB_TEST_PASSWORD,
    "Requires a disposable authenticated test account; never bypass the server guard",
  );
  await page.goto("/login");
  await page.locator("#email").fill(process.env.QB_TEST_EMAIL!);
  await page.locator("#password").fill(process.env.QB_TEST_PASSWORD!);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await page.waitForURL("**/app", { timeout: 45000 });
}

test("public documentation explains Alpaca and retired download endpoints return 410", async ({
  page,
  request,
}) => {
  await page.goto("/docs#retornos-diarios");
  const section = page.locator("#retornos-diarios");
  await expect(section).toContainText("Alpaca SIP");
  await expect(section).toContainText("stocks_open_close_mae_v1");
  for (const path of ["/api/datasets", "/api/datasets/download?id=btc"]) {
    const r = await request.get(path);
    expect(r.status()).toBe(410);
    expect(await r.text()).not.toContain("Binance");
  }
});

test("Alpaca history and honest empty daily state replace legacy links", async ({
  page,
}, info) => {
  await login(page);
  const worker = new URL(process.env.NEXT_PUBLIC_WORKER_URL!).hostname;
  const old: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== worker) return route.continue();
    if (/return-tournaments|return-rounds/.test(url.pathname))
      old.push(url.pathname);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ rounds: [] }),
    });
  });
  await page.goto("/app/library");
  await expect(
    page.getByRole("heading", {
      name: "Histórico de Alpaca · train y validation",
    }),
  ).toBeVisible();
  for (const name of ["train.parquet", "validation.parquet"])
    await expect(
      page.getByRole("link", { name: `Descargar ${name}`, exact: true }),
    ).toHaveAttribute(
      "href",
      new RegExp(
        `github.com/Emelecto/QuantBattle/releases/download/stocks-history-v1/${name}`,
      ),
    );
  await expect(
    page.getByText("Todavía no hay rondas diarias publicadas.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Binance");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../artifacts/alpaca-ui/${info.project.name}-empty.png`,
    fullPage: true,
  });
  await page.goto("/app/tournaments/weekly/retired-week");
  await expect(page).toHaveURL(/\/app\/tournaments$/);
  expect(old).toEqual([]);
});

test("daily files verify hashes, receipts display, and closed rounds cannot submit", async ({
  page,
}, info) => {
  await login(page);
  const worker = new URL(process.env.NEXT_PUBLIC_WORKER_URL!).hostname;
  const live = "id,feature_1\na,1\nb,2\n";
  const digest = createHash("sha256").update(live).digest("hex");
  let corrupt = false;
  const round = {
    id: "stocks-oc-2030-01-02",
    target_date: "2030-01-02",
    observation_date: "2030-01-01",
    deadline: "2030-01-02T14:00:00Z",
    status: "open",
    rows: 2,
    manifest_hash: digest,
    files: [
      "live.csv",
      "live.parquet",
      "submission_template.csv",
      "manifest.json",
      "README.md",
      "quality_report.json",
    ],
  };
  let attempts: unknown[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const json = (value: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (url.hostname === "daily-fixture.invalid")
      return route.fulfill({ contentType: "text/csv", body: live });
    if (url.hostname !== worker) return route.continue();
    if (url.pathname === "/ml/stock-rounds")
      return json({
        rounds: [
          round,
          {
            ...round,
            id: "stocks-oc-2020-01-02",
            target_date: "2020-01-02",
            deadline: "2020-01-02T14:00:00Z",
          },
        ],
      });
    if (url.pathname.includes("/download/"))
      return json({
        url: "https://daily-fixture.invalid/live.csv",
        sha256: corrupt ? "0".repeat(64) : digest,
      });
    if (url.pathname.endsWith("/mine")) return json({ attempts });
    if (url.pathname.endsWith("/predictions")) {
      const raw = route.request().postDataBuffer()!;
      const receipt = {
        id: "receipt-1",
        row_count: 2,
        submitted_at: new Date().toISOString(),
        is_selected: true,
        file_sha256: createHash("sha256").update(raw).digest("hex"),
        status: "validated",
        score: null,
      };
      attempts = [receipt];
      return json({ submission: receipt });
    }
    return json({});
  });
  await page.goto("/app/tournaments");
  const daily = page.locator("#rondas-diarias");
  await expect(
    daily.getByText("Recibiendo predicciones", { exact: true }),
  ).toHaveCount(1);
  await expect(daily.getByText("Envíos cerrados", { exact: true })).toHaveCount(
    1,
  );
  await daily
    .getByRole("button", { name: "Ver datos y mis envíos" })
    .first()
    .click();
  const download = page.waitForEvent("download");
  await daily
    .getByRole("button", { name: "Descargar live.csv", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(round.id + "-live.csv");
  corrupt = true;
  await daily
    .getByRole("button", { name: "Descargar live.csv", exact: true })
    .click();
  await expect(daily.getByRole("alert")).toContainText(
    "huella del archivo no coincide",
  );
  await daily
    .getByLabel("CSV de predicciones de acciones")
    .setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("id,prediction\na,0\nb,0\n"),
    });
  await daily
    .getByRole("button", { name: "Enviar predicciones", exact: true })
    .click();
  await expect(daily.getByRole("status")).toContainText(
    "Predicciones registradas",
  );
  await expect(daily.getByText(/2 filas · Seleccionado/)).toBeVisible();
  await page.screenshot({
    path: `../artifacts/alpaca-ui/${info.project.name}-daily.png`,
    fullPage: true,
  });
  await daily.getByRole("button", { name: "Ver datos y mis envíos" }).click();
  await expect(daily.getByLabel("CSV de predicciones de acciones")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
