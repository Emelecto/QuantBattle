import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1.0.19";
import { exportJWK, generateKeyPair, SignJWT } from "npm:jose@6.2.15";

const base = "https://mcp-test.supabase.co";
const endpoint = `${base}/functions/v1/quantbattle-mcp`;
const { publicKey, privateKey } = await generateKeyPair("ES256");
Deno.env.set("SUPABASE_URL", base);
Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_fixture_only");
Deno.env.set(
  "SUPABASE_JWKS",
  JSON.stringify({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256" }],
  }),
);
const { handleMcpRequest } = await import("./server.ts");

async function token(subject = "participant-a", expires = "5m") {
  return await new SignJWT({
    role: "authenticated",
    email: "fixture@example.invalid",
  })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(subject)
    .setIssuer(`${base}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(privateKey);
}
function request(
  method: string,
  params: unknown = {},
  bearer?: string,
  publicOnly = false,
) {
  return new Request(endpoint + (publicOnly ? "/public" : ""), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
async function result(response: Response) {
  const text = await response.text();
  if (text.startsWith("event:"))
    return JSON.parse(text.split("data: ")[1].split("\n")[0]);
  return JSON.parse(text);
}

Deno.test(
  "initialize and tools/list require OAuth before exposing tools",
  async () => {
    for (const method of ["initialize", "tools/list", "tools/call"]) {
      const response = await handleMcpRequest(request(method));
      assertEquals(response.status, 401);
      assertStringIncludes(
        response.headers.get("WWW-Authenticate")!,
        'resource_metadata="' + endpoint,
      );
      assertStringIncludes(
        response.headers.get("Access-Control-Expose-Headers")!,
        "WWW-Authenticate",
      );
      await response.body?.cancel();
    }
  },
);
Deno.test(
  "discovery and browser preflight stay accessible without a session",
  async () => {
    const response = await handleMcpRequest(
      new Request(endpoint + "/oauth-protected-resource"),
    );
    assertEquals(response.status, 200);
    const metadata = await response.json();
    assertEquals(metadata.resource, endpoint);
    assertEquals(metadata.authorization_servers, [`${base}/auth/v1`]);
    for (const url of [
      endpoint,
      endpoint + "/public",
      endpoint + "/oauth-protected-resource",
    ]) {
      const preflight = await handleMcpRequest(
        new Request(url, {
          method: "OPTIONS",
          headers: {
            Origin: "https://example.invalid",
            "Access-Control-Request-Method": "POST",
          },
        }),
      );
      assert(preflight.status < 300);
      assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
      await preflight.body?.cancel();
    }
  },
);
Deno.test(
  "public endpoint omits all private and write tools, and rejects direct calls",
  async () => {
    const listed = await result(
      await handleMcpRequest(
        request("tools/list", {}, "ignored-invalid-token", true),
      ),
    );
    const names = listed.result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    assert(names.includes("get_historical_dataset_download"));
    for (const name of [
      "get_connection_status",
      "submit_stock_predictions",
      "validate_stock_prediction_csv",
      "get_daily_dataset_download",
      "get_my_stock_submissions",
      "get_stock_results",
    ]) {
      assert(!names.includes(name));
      const called = await result(
        await handleMcpRequest(
          request("tools/call", { name, arguments: {} }, undefined, true),
        ),
      );
      assert(called.error || called.result?.isError);
    }
  },
);
Deno.test(
  "malformed and expired tokens cannot initialize or access a private tool",
  async () => {
    for (const bearer of ["not-a-jwt", await token("participant-a", "-10m")]) {
      const response = await handleMcpRequest(
        request("tools/list", {}, bearer),
      );
      assertEquals(response.status, 401);
      assert(response.headers.has("WWW-Authenticate"));
      await response.body?.cancel();
    }
  },
);
Deno.test(
  "account check validates identity, stays independent of Render, and checks the auth server",
  async () => {
    const originalFetch = globalThis.fetch;
    let deny = false;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      assertEquals(url, `${base}/auth/v1/user`); // Any Render call fails this test.
      const authorization = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      ).get("authorization");
      assert(authorization?.startsWith("Bearer "));
      return Response.json(
        deny
          ? { message: "Session revoked" }
          : {
              id: "participant-a",
              email: "fixture@example.invalid",
              aud: "authenticated",
              role: "authenticated",
            },
        { status: deny ? 401 : 200 },
      );
    };
    try {
      const bearer = await token();
      const response = await handleMcpRequest(
        request(
          "tools/call",
          { name: "get_connection_status", arguments: {} },
          bearer,
        ),
      );
      assertEquals(response.status, 200);
      const payload = await result(response);
      const account = JSON.parse(payload.result.content[0].text);
      assertEquals(account.user_id, "participant-a");
      assertEquals(account.authenticated, true);
      assert(!JSON.stringify(account).includes(bearer));
      deny = true;
      const revoked = await handleMcpRequest(request("tools/list", {}, bearer));
      assertEquals(revoked.status, 401);
      assert(revoked.headers.has("WWW-Authenticate"));
      await revoked.body?.cancel();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  "auth service outages request retry instead of asking for new credentials",
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({ message: "temporarily unavailable" }, { status: 503 });
    try {
      const response = await handleMcpRequest(
        request("tools/list", {}, await token()),
      );
      assertEquals(response.status, 503);
      assertEquals(response.headers.get("Retry-After"), "10");
      assertEquals(response.headers.get("WWW-Authenticate"), null);
      await response.body?.cancel();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  "Supabase proxy path and HTTP origin do not break public routing or HTTPS discovery",
  async () => {
    const internal = "http://mcp-test.supabase.co/quantbattle-mcp";
    const response = await handleMcpRequest(
      new Request(internal + "/oauth-protected-resource"),
    );
    assertEquals((await response.json()).resource, endpoint);
    const externalRequest = request("tools/list", {}, undefined, true);
    const publicResponse = await handleMcpRequest(
      new Request(internal + "/public", externalRequest),
    );
    assertEquals(publicResponse.status, 200);
    const listed = await result(publicResponse);
    assert(
      listed.result.tools.some(
        (tool: { name: string }) => tool.name === "list_ml_tournaments",
      ),
    );
  },
);

Deno.test(
  "public catalog contains one Alpaca train/validation pair with byte checksums and no retired tools",
  async () => {
    const listed = await result(
      await handleMcpRequest(request("tools/list", {}, undefined, true)),
    );
    assertEquals(
      listed.result.tools.map((t: { name: string }) => t.name).sort(),
      ["get_historical_dataset_download", "list_ml_tournaments"],
    );
    const payload = await result(
      await handleMcpRequest(
        request(
          "tools/call",
          { name: "get_historical_dataset_download", arguments: {} },
          undefined,
          true,
        ),
      ),
    );
    const catalog = JSON.parse(payload.result.content[0].text);
    assertEquals(catalog.source, "Alpaca");
    assertEquals(catalog.train.rows, 83563);
    assertEquals(catalog.validation.rows, 34962);
    assert(!JSON.stringify(catalog).includes("Binance"));
    for (const filename of ["train.parquet", "validation.parquet"]) {
      const payload = await result(
        await handleMcpRequest(
          request(
            "tools/call",
            {
              name: "get_historical_dataset_download",
              arguments: { filename },
            },
            undefined,
            true,
          ),
        ),
      );
      const file = JSON.parse(payload.result.content[0].text);
      assertEquals(file.checksum_scope, "downloaded_file_bytes");
      assert(/^[a-f0-9]{64}$/.test(file.sha256));
      assert(
        file.url.startsWith(
          "https://github.com/Emelecto/QuantBattle/releases/",
        ),
      );
    }
  },
);

Deno.test(
  "authenticated catalog excludes expired rounds and verifies template bytes before accepting a CSV",
  async () => {
    const originalFetch = globalThis.fetch;
    const template = "id,prediction\na,0\nb,0\n";
    const bytes = new TextEncoder().encode(template);
    const sha = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    let corrupt = false,
      writes = 0;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${base}/auth/v1/user`)
        return Response.json({
          id: "participant-a",
          role: "authenticated",
          aud: "authenticated",
        });
      if (url.endsWith("/ml/stock-rounds"))
        return Response.json({
          rounds: [
            {
              id: "stocks-oc-2030-01-02",
              status: "open",
              deadline: "2030-01-02T14:00:00Z",
            },
            {
              id: "stocks-oc-2020-01-02",
              status: "open",
              deadline: "2020-01-02T14:00:00Z",
            },
            {
              id: "stocks-oc-2020-01-03",
              status: "settled",
              deadline: "2020-01-03T14:00:00Z",
            },
          ],
        });
      if (url.endsWith("/download/submission_template.csv"))
        return Response.json({
          url: "https://fixture.invalid/template",
          sha256: corrupt ? "0".repeat(64) : sha,
        });
      if (url === "https://fixture.invalid/template")
        return new Response(template);
      if (url.endsWith("/predictions") && init?.method === "POST") {
        writes++;
        return Response.json({ submission: { id: "receipt" } });
      }
      throw new Error("Unexpected request: " + url);
    };
    try {
      const bearer = await token();
      const call = async (name: string, args: unknown) =>
        (
          await result(
            await handleMcpRequest(
              request("tools/call", { name, arguments: args }, bearer),
            ),
          )
        ).result;
      const catalog = JSON.parse(
        (await call("list_ml_tournaments", {})).content[0].text,
      );
      assertEquals(catalog.published_round_count, 3);
      assertEquals(
        catalog.daily_rounds.map((r: { id: string }) => r.id),
        ["stocks-oc-2030-01-02"],
      );
      const args = {
        round_id: "stocks-oc-2030-01-02",
        csv_content: "id,prediction\na,-0.02\nb,0\n",
      };
      assertEquals(
        JSON.parse(
          (await call("validate_stock_prediction_csv", args)).content[0].text,
        ).rows,
        2,
      );
      assertEquals(writes, 0);
      assert(
        (
          await call("submit_stock_predictions", {
            ...args,
            csv_content: "id,prediction\na,0\n",
          })
        ).isError,
      );
      assertEquals(writes, 0);
      corrupt = true;
      assert((await call("submit_stock_predictions", args)).isError);
      assertEquals(writes, 0);
      corrupt = false;
      assertEquals(
        JSON.parse(
          (await call("submit_stock_predictions", args)).content[0].text,
        ).submission.id,
        "receipt",
      );
      assertEquals(writes, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
