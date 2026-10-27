import { expect, test, type Page } from "@playwright/test";
test.setTimeout(60_000);

const projectId = "10000000-0000-4000-8000-000000000001";
const pageErrors = new WeakMap<Page, string[]>();
const versionId = "20000000-0000-4000-8000-000000000001";
const project = {
  id: projectId,
  title: "Hipótesis de validación",
  hypothesis: "Una regresión puede mejorar la referencia.",
  protocol: "daily_return_mae_v1",
  updated_at: "2026-10-27T12:00:00Z",
};
const snapshot = {
  model_name: "Ridge",
  parameters: { alpha: 1 },
  seed: 7,
  note: "privada",
  dataset_version: "dr1-demo",
  validation_mae: 0.025,
  dependencies: "scikit-learn",
  protocol: project.protocol,
  hypothesis: project.hypothesis,
};
const missions = [
  {
    id: "leakage",
    version: 1,
    title: "Detecta la fuga de información",
    kind: "choice",
    prompt: "¿Qué columna utiliza el futuro?",
    options: ["Volatilidad histórica", "Retorno de mañana", "Media móvil"],
    lesson: "/app/academia/mates/7",
  },
];

async function setup(page: Page) {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  const source = process.env.NEXT_PUBLIC_SUPABASE_URL,
    worker = process.env.NEXT_PUBLIC_WORKER_URL;
  if (!source || !worker)
    throw new Error(
      "Configura los hosts públicos para ejecutar los contratos de navegador.",
    );
  const host = new URL(source).hostname,
    workerHost = new URL(worker).hostname;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "technical@example.test",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: {},
    app_metadata: { provider: "email" },
    created_at: "2026-10-01T00:00:00Z",
  };
  const token = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        role: "authenticated",
        aud: "authenticated",
        exp: expires,
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  await page.context().addCookies([
    {
      name: `sb-${host.split(".")[0]}-auth-token`,
      value: JSON.stringify({
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        expires_at: expires,
        token_type: "bearer",
        user,
      }),
      url: "http://localhost:3100",
    },
  ]);
  let versions: Record<string, unknown>[] = [];
  let hasProject = false;
  let passed = false;
  const checkpoints: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (url.hostname === host)
      return json(
        path.endsWith("/auth/v1/user") ? user : {},
        path.endsWith("/auth/v1/user") ? 200 : 400,
      );
    if (url.hostname !== workerHost) return route.continue();
    if (path === "/ml/projects" && method === "POST") {
      hasProject = true;
      return json({ ...project, ...route.request().postDataJSON() }, 201);
    }
    if (path === "/ml/projects")
      return json({ entries: hasProject ? [project] : [], has_more: false });
    if (path === `/ml/projects/${projectId}`)
      return json({ project, versions, submissions: [] });
    if (path === `/ml/projects/${projectId}/versions`) {
      versions = [
        {
          id: versionId,
          project_id: projectId,
          snapshot: { ...snapshot, ...route.request().postDataJSON() },
          notebook_sha256: null,
          created_at: "2026-10-27T12:00:00Z",
        },
      ];
      return json(versions[0], 201);
    }
    if (path === "/ml/learning/missions")
      return json({ missions, synthetic: true });
    if (path === "/ml/learning/progress")
      return json({
        checkpoints,
        passed_missions: passed ? ["leakage"] : [],
        has_submission: false,
        attempts: [],
      });
    if (path === "/ml/learning/checkpoints" && method === "POST") {
      checkpoints.push(route.request().postDataJSON().step);
      return json({ saved: true, source: "self_reported" });
    }
    if (path === "/ml/learning/missions/leakage/attempts") {
      passed = route.request().postDataJSON().choice === 1;
      return json({
        passed,
        explanation: "El retorno de mañana no está disponible hoy.",
      });
    }
    if (path === "/ml/return-tournaments") return json({ tournaments: [] });
    if (path === "/ml/return-submissions/mine") return json({ entries: [] });
    if (path.startsWith("/ml/learning/error-lab/"))
      return json(
        {
          detail: "El laboratorio se habilita cuando se libera toda la semana",
        },
        409,
      );
    if (path === "/ml/notebooks") return json({ entries: [], has_more: false });
    if (path === "/tokens/balance") return json({ balance: 0, tier: "free" });
    return json({ notifications: [], unread_count: 0 });
  });
}

test.beforeEach(async ({ page }) => {
  await setup(page);
});
test.afterEach(async ({ page }, info) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (!/visual glossary|notebook library/.test(info.title)) {
    const name = info.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    await page.screenshot({
      path: `../artifacts/ml-learning/${info.project.name}-${name}.png`,
      fullPage: true,
    });
  }
});

test("first tournament distinguishes preparation from a server-confirmed submission", async ({
  page,
}) => {
  await page.goto("/app/learn/first-tournament");
  await expect(
    page.getByText("0 de 4 hitos · preparación y primer envío"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ya revisé las reglas" }).click();
  await expect(
    page.getByText("1 de 4 hitos · preparación y primer envío"),
  ).toBeVisible();
  await expect(
    page.getByText(/El paso se completará cuando el servidor registre/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("1 de 4 hitos · preparación y primer envío"),
  ).toBeVisible();
});

test("create a tournament ML project and save an immutable model version", async ({
  page,
}) => {
  await page.goto("/app/strategies/new");
  await page.getByLabel("Nombre del proyecto").fill(project.title);
  await page.getByLabel("Hipótesis", { exact: true }).fill(project.hypothesis);
  await page
    .getByRole("button", { name: "Crear proyecto", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/strategies/${projectId}$`), {
    timeout: 15_000,
  });
  await page.getByLabel("Modelo", { exact: true }).fill("Ridge");
  await page.getByLabel("Parámetros JSON").fill('{"alpha":1}');
  await page
    .getByRole("button", { name: "Guardar versión", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Versión guardada");
  await expect(
    page.getByRole("table", {
      name: "Configuraciones declaradas · no son resultados oficiales",
    }),
  ).toContainText("Ridge");
  await expect(page.getByText("Sharpe OOS", { exact: true })).toHaveCount(0);
});

test("missions provide feedback and preserve completion when returning", async ({
  page,
}) => {
  await page.goto("/app/learn/missions");
  await page.getByLabel("Retorno de mañana", { exact: true }).check();
  await page.getByRole("button", { name: "Evaluar mi respuesta" }).click();
  await expect(
    page.getByRole("heading", { name: "Misión completada" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 de 3 completadas")).toBeVisible();
});

test("error lab communicates retention and does not show future asset data", async ({
  page,
}) => {
  let reportRequests = 0;
  await page.route("**/ml/learning/error-lab/**", (route) => {
    reportRequests++;
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "El laboratorio se habilita cuando se libera toda la semana",
      }),
    });
  });
  await page.goto("/app/learn/errors");
  await expect(
    page.getByText(/No hay una ronda liberada con envío propio/),
  ).toBeVisible();
  await page.getByLabel("ID de ronda con resultados liberados").fill(projectId);
  await page.getByRole("button", { name: "Analizar mi envío" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "se libera toda la semana" }),
  ).toContainText("se libera toda la semana");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.locator(".ml-error")).not.toContainText("/ml/");
  await page.getByRole("button", { name: "Reintentar análisis" }).click();
  await expect.poll(() => reportRequests).toBe(2);
  await expect(page.locator('.ml-error')).toContainText('Vuelve cuando termine y se verifique el torneo.');
});

test("failed availability lookups stay unknown instead of claiming no rounds exist", async ({
  page,
}) => {
  await page.route("**/ml/return-tournaments?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Consulta de rondas no disponible" }),
    }),
  );
  await page.goto("/app/learn/first-tournament");
  await expect(
    page.getByText(
      "No se pudo confirmar la disponibilidad de rondas. Reintenta la consulta.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/No encontramos una ronda real abierta/),
  ).toHaveCount(0);
  await page.goto("/app/learn/errors");
  await expect(
    page.getByText(/No se pudo determinar qué rondas están disponibles/),
  ).toBeVisible();
  await expect(
    page.getByText(/No hay una ronda liberada con envío propio/),
  ).toHaveCount(0);
});

test("visual glossary responds to controls and fits the viewport", async ({
  page,
}, info) => {
  await page.goto("/app/learn/glossary");
  const before = await page.getByText(/^MAE =/).textContent();
  await page.getByLabel(/Desplaza todas tus predicciones/).fill("2");
  await expect(page.getByText(/^MAE =/)).not.toHaveText(before!);
  await expect(page.getByRole("img", { name: /Train periodos/ })).toBeVisible();
  expect(
    await page
      .getByRole("region", {
        name: "Cronología de entrenamiento y validación, desplazable",
      })
      .locator("svg")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(600);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../artifacts/ml-learning/${info.project.name}-glossary.png`,
    fullPage: true,
  });
});

test("notebook library offers real templates without invented community contributions", async ({
  page,
}, info) => {
  await page.goto("/app/marketplace");
  await expect(
    page.getByRole("heading", { name: "Biblioteca de métodos ML" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Notebook de retornos · MAE" }),
  ).toHaveAttribute("href", "/ml/ejemplo_retornos_diarios.ipynb");
  await expect(
    page.getByText("Todavía no hay publicaciones en esta lista."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../artifacts/ml-learning/${info.project.name}-library.png`,
    fullPage: true,
  });
});
