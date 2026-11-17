// Local Auth contract for both Next.js server requests and browser fixtures.
// Never imported by the product, deployed, or connected to a remote database.
import { createServer } from "node:http";

const signatures = new Set(["test-signature", "contract-signature", "preview-signature"]);
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end('{"status":"isolated-release-auth"}');
  if (req.url === "/auth/v1/user" && req.method === "GET") {
    try {
      const [header, payload, signature, extra] = (req.headers.authorization || "").replace(/^Bearer /, "").split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (extra || !header || !signatures.has(signature) ||
          !/^[0-9a-f-]{36}$/i.test(claims.sub) || claims.role !== "authenticated" ||
          claims.aud !== "authenticated" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw new Error("invalid test identity");
      return res.end(JSON.stringify({ id: claims.sub, aud: "authenticated", role: "authenticated",
        email: "release-fixture@example.test", user_metadata: {}, app_metadata: { provider: "email" },
        created_at: "2026-01-01T00:00:00Z" }));
    } catch { /* Invalid or absent test identities fail closed, as in production. */ }
  }
  res.writeHead(401);
  res.end('{"message":"A valid isolated test identity is required"}');
}).listen(3331, "127.0.0.1");
