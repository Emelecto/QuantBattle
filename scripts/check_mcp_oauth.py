"""OAuth integration check. Creates and deletes a disposable client and user.
Run only against a project where you are authorized to create test accounts.
Never prints credentials. Requires admin credentials in the supplied env file.
"""
import argparse
import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    args = parser.parse_args()
    env = {}
    for line in Path(args.env_file).read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            env[key] = value.strip().strip('"').strip("'")
    base = env["SUPABASE_URL"].rstrip("/")
    admin = env["SUPABASE_SERVICE_ROLE_KEY"]
    opener = urllib.request.build_opener(NoRedirect)
    def call(path, body=None, bearer=None, method=None, form=False):
        headers = {"apikey": admin}
        if bearer:
            headers["Authorization"] = "Bearer " + bearer
        data = None
        if body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
            data = (urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
        req = urllib.request.Request(base + "/auth/v1" + path, data=data, headers=headers, method=method)
        try:
            response = opener.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        result = json.loads(raw) if raw and "json" in response.headers.get("Content-Type", "") else {}
        return response.status, result, response.headers
    client_id = user_id = None
    try:
        status, client, _ = call("/oauth/clients/register", {
            "client_name": "QuantBattle disposable OAuth check", "redirect_uris": ["http://127.0.0.1:38991/callback"],
            "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        })
        assert status == 201, ("dynamic registration", status, client.get("error_description", client.get("msg")))
        client_id = client["client_id"]
        print("PASS dynamic public client registration (no client secret)")
        password = secrets.token_urlsafe(32)
        status, user, _ = call("/admin/users", {"email": "mcp-check-" + secrets.token_hex(8) + "@example.com", "password": password, "email_confirm": True}, admin)
        assert status in (200, 201), ("create fixture", status)
        user_id = user["id"]
        status, session, _ = call("/token?grant_type=password", {"email": user["email"], "password": password})
        assert status == 200, ("fixture login", status)
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(24)
        params = {"client_id": client_id, "redirect_uri": client["redirect_uris"][0], "response_type": "code", "scope": "openid profile email offline_access", "state": state, "code_challenge": challenge, "code_challenge_method": "S256"}
        status, _, headers = call("/oauth/authorize?" + urllib.parse.urlencode(params))
        assert status in (302, 303), ("authorize", status)
        consent = urllib.parse.urlparse(headers["Location"])
        assert consent.hostname == "quantbattle.co" and consent.path == "/oauth/consent", "Unexpected consent destination"
        authorization_id = urllib.parse.parse_qs(consent.query)["authorization_id"][0]
        status, details, _ = call("/oauth/authorizations/" + authorization_id, bearer=session["access_token"])
        assert status == 200 and details["client"]["id"] == client_id, ("consent details", status)
        status, denied, _ = call("/oauth/authorizations/" + authorization_id + "/consent", {"action": "deny"}, session["access_token"])
        assert status == 200, ("deny consent", status)
        rejection = urllib.parse.parse_qs(urllib.parse.urlparse(denied["redirect_url"]).query)
        assert rejection["error"][0] == "access_denied" and rejection["state"][0] == state
        print("PASS denied consent returns access_denied with matching state")
        state = secrets.token_urlsafe(24)
        params["state"] = state
        status, _, headers = call("/oauth/authorize?" + urllib.parse.urlencode(params))
        assert status in (302, 303), ("restart authorization", status)
        authorization_id = urllib.parse.parse_qs(urllib.parse.urlparse(headers["Location"]).query)["authorization_id"][0]
        status, _, _ = call("/oauth/authorizations/" + authorization_id, bearer=session["access_token"])
        assert status == 200, ("restarted consent details", status)
        status, approved, _ = call("/oauth/authorizations/" + authorization_id + "/consent", {"action": "approve"}, session["access_token"])
        assert status == 200, ("consent", status)
        callback = urllib.parse.parse_qs(urllib.parse.urlparse(approved["redirect_url"]).query)
        assert callback["state"][0] == state
        code = callback["code"][0]
        exchange = {"grant_type": "authorization_code", "client_id": client_id, "redirect_uri": params["redirect_uri"], "code_verifier": verifier, "code": code}
        status, tokens, _ = call("/oauth/token", exchange, form=True)
        assert status == 200 and tokens.get("access_token"), ("PKCE token exchange", status, tokens.get("error_description"))
        print("PASS consent, state and PKCE exchange")
        status, _, _ = call("/oauth/token", exchange, form=True)
        assert status >= 400, "Authorization code must be single use"
        status, refreshed, _ = call("/oauth/token", {"grant_type": "refresh_token", "client_id": client_id, "refresh_token": tokens["refresh_token"]}, form=True)
        assert status == 200 and refreshed.get("access_token"), ("refresh", status)
        print("PASS single-use code and refresh")
        status, _, _ = call("/user", bearer=refreshed["access_token"])
        assert status == 200, ("OAuth user identity", status)
        print("PASS OAuth token accepted by user endpoint")
        status, _, _ = call("/user/oauth/grants?" + urllib.parse.urlencode({"client_id": client_id}), bearer=session["access_token"], method="DELETE")
        assert status in (200, 204), ("revoke grant", status)
        status, _, _ = call("/oauth/token", {"grant_type": "refresh_token", "client_id": client_id, "refresh_token": refreshed["refresh_token"]}, form=True)
        assert status >= 400, "Revoked grant must not refresh"
        print("PASS revoked grant cannot refresh")
    finally:
        for path, label in [("/admin/oauth/clients/" + client_id if client_id else None, "client"), ("/admin/users/" + user_id if user_id else None, "user")]:
            if path:
                status, _, _ = call(path, bearer=admin, method="DELETE")
                if status not in (200, 204):
                    raise RuntimeError("Fixture cleanup failed: " + label + " HTTP " + str(status))
        print("CLEANUP complete")

if __name__ == "__main__":
    main()
