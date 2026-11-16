// Isolated identity for browser tests; production authentication is unchanged.
import { createServer } from "node:http";
export const user = { id: "00000000-0000-0000-0000-000000000001", email: "demo@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end('{"status":"test-fixture"}');
  if (req.url === "/auth/v1/user" && req.headers.authorization?.endsWith(".test-signature")) return res.end(JSON.stringify(user));
  res.statusCode = 401;
  res.end('{"message":"Test credential required"}');
}).listen(3231, "127.0.0.1");
