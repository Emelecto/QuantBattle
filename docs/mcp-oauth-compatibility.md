# MCP authentication and compatibility

## Endpoints

- Account MCP: `https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp`
- Anonymous, read-only MCP: the same URL followed by `/public`.
- Resource discovery: the account URL followed by `/oauth-protected-resource`.

The account endpoint requires a verified user token even for `initialize` and
`tools/list`. Missing, invalid and expired credentials return HTTP 401 with a
WWW-Authenticate resource metadata challenge. Discovery and OPTIONS stay open.
Browser clients can read the challenge through Access-Control-Expose-Headers.
The public endpoint registers only public tools and ignores supplied credentials.
Private tools cannot be called there even if their names are known.

Run `get_connection_status` after authorization. It confirms the verified user ID
without waiting for Render or exposing tokens. It reports authenticated access,
not whether the client used a particular UI or whether a tournament accepts entries.
JWT validation and the Supabase user endpoint are checked on each account request.
A rejection by either returns a new OAuth challenge.

## Active data catalog

MCP 4.0 serves Alpaca historical train/validation and authenticated daily stock rounds. See [the dataset contract](alpaca-datasets.md). Refresh tools after upgrading: weekly Binance and synthetic prediction tools have been removed. The public endpoint exposes the historical catalog only; querying the daily calendar requires authorization.

## OAuth contract

Supabase remains the authorization server; do not introduce a second token issuer.
Dynamic registration must be enabled. Public clients use PKCE S256 and
`token_endpoint_auth_method: none`; end users must not create client secrets.
Supported scopes come from Supabase discovery. The integration check exercises
`openid profile email offline_access`. Never request invented MCP scopes.
Do not add device-flow metadata unless a real device authorization endpoint exists.

A callback on localhost/127.0.0.1 must reach the machine running the OAuth client.
Remote/SSH agents require the client's documented callback forwarding or remote
return mechanism. This cannot be repaired by changing the user's API key.

Consent waits are bounded to 20 seconds. A timed-out operation may still complete
on the auth server; restart authorization rather than reusing an uncertain link.
Authorization codes are single-use. Keep state and PKCE handling in the client.

Revocation prevents refresh. An already issued access JWT may remain valid until
expiry depending on Supabase's revocation semantics. Do not claim immediate JWT
revocation based solely on a grant being removed. Test actual invalidation policy
before promising immediate disconnection in the product.

## Automated verification

From the repository root:

```
deno test --allow-env --allow-net supabase/functions/quantbattle-mcp/index_test.ts
```

Tests use locally signed fixture tokens, not real accounts. They cover initial
401 challenges, discovery, preflight, private-tool exclusion, direct-call denial,
invalid/expired tokens, verified account identity and an auth-server rejection.
An outbound call to Render during account verification fails the test.
The MCP CI workflow runs these contracts on changes.

Optional live identity-provider check (requires authorization to create fixtures):

```
python scripts/check_mcp_oauth.py --env-file /absolute/path/to/worker/.env
```

Creates a disposable public OAuth client and confirmed user. Tests registration,
denial, restart, approval, PKCE exchange, state, single-use codes, refresh,
user lookup and grant revocation. Deletes fixtures in finally and prints no
credentials. This does not replace browser/client interoperability tests.

## Release verification

Deploy the Edge Function and updated website together; no database migration is
needed. Keep platform `verify_jwt = false`: the function performs verification so
unauthenticated clients can discover OAuth rather than receiving a gateway error.
Check the function runtime has SUPABASE_URL, signing/JWKS configuration and its
platform-provided publishable key available to @supabase/server. End users never
supply this server configuration.

The current function code is tested locally. The live OAuth check verifies the
existing Supabase authorization service, not a deployment of this function change.

Before declaring client compatibility, record the version and test on Hermes,
Cursor, VS Code/Copilot and an MCP reference client:

1. Fresh setup reaches consent before listing tools.
2. Logged-out user signs in and resumes the same request.
3. Approve returns to the agent; get_connection_status identifies the right user.
4. Deny, expired link and an unavailable callback produce actionable failures.
5. Restart the client, refresh its session, then revoke and check reconnection.
6. A second user cannot read the first user's submissions.

Client status: these interactive checks are pending; do not label them passed
based on server protocol tests. Clients without remote HTTP OAuth support can use
only the public endpoint unless they implement a compatible adapter.
