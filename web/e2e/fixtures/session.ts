import type { Page } from "@playwright/test";

/** Test identity accepted only by e2e/fixtures/release-auth.mjs. */
export async function authenticatedSession(page: Page) {
  const source = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: "00000000-0000-0000-0000-000000000001", email: "release-fixture@example.test",
    aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" };
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: user.id, role: user.role, aud: user.aud, exp: expires })).toString("base64url")}.test-signature`;
  await page.context().addCookies([{ name: `sb-${source.hostname.split(".")[0]}-auth-token`,
    value: JSON.stringify({ access_token: token, refresh_token: "isolated-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user }), url: "http://localhost:3100" }]);
  await page.route(`${source.origin}/auth/v1/user*`, (route) => route.fulfill({ json: user }));
  await page.route(`${source.origin}/rest/v1/**`, (route) => route.fulfill({ json: [] }));
  return { token, user };
}
