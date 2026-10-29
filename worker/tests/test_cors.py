# Tests para el middleware CORS dinámico (fail-closed / cerrado por defecto).
# Verifica que:
#   1. Sin CORS_ORIGINS configurado → NO se refleja ningún Origin (sin
#      Access-Control-Allow-Origin): el navegador bloquea lecturas cross-origin.
#   2. Con CORS_ORIGINS configurado → solo refleja Origins de la lista blanca.
#   3. Preflight OPTIONS responde 200 con los headers correctos (cerrado sin lista).

import os
import pytest
from fastapi.testclient import TestClient


def _make_app_with_cors(cors_origins_env: str | None):
    """Reconfigura el app con un valor específico de CORS_ORIGINS."""
    if cors_origins_env is not None:
        os.environ["CORS_ORIGINS"] = cors_origins_env
    elif "CORS_ORIGINS" in os.environ:
        del os.environ["CORS_ORIGINS"]

    # Forzar reimport del módulo main para que lea el nuevo env.
    import importlib
    import main as main_mod
    importlib.reload(main_mod)
    return main_mod.app


def test_cors_no_env_reflects_origin_and_allows_credentials():
    """Sin CORS_ORIGINS, ningún Origin se refleja (CORS cerrado, fail-closed)."""
    app = _make_app_with_cors("")  # vacío = no configurado
    client = TestClient(app)
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://mi-app.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") is None
    assert resp.headers.get("access-control-allow-credentials") is None


def test_cors_with_env_only_allows_whitelist():
    """Con CORS_ORIGINS, solo los Origins en la lista blanca reciben CORS headers."""
    app = _make_app_with_cors("https://www.quantbattle.co,https://foo.vercel.app")
    client = TestClient(app)

    # Origin permitido
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://www.quantbattle.co",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://www.quantbattle.co"
    assert resp.headers.get("access-control-allow-credentials") == "true"

    # Origin NO permitido → no debe recibir CORS headers específicos.
    resp2 = client.options(
        "/health",
        headers={
            "Origin": "https://malicious-site.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp2.status_code == 200
    assert resp2.headers.get("access-control-allow-origin") != "https://malicious-site.com"


def test_cors_preflight_on_post_endpoint():
    """Preflight sin lista blanca: 200 pero SIN reflejar Origin (cerrado)."""
    app = _make_app_with_cors("")  # sin env → cerrado
    client = TestClient(app)
    resp = client.options(
        "/marketplace/publish",
        headers={
            "Origin": "https://mi-app.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type,Authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") is None
    assert resp.headers.get("access-control-allow-credentials") is None
    assert "POST" in resp.headers.get("access-control-allow-methods", "")


def test_cors_no_origin_header_gets_wildcard():
    """Sin header Origin y sin lista, no se emite Allow-Origin (cerrado)."""
    app = _make_app_with_cors("")  # sin env
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    # Cerrado: sin Origin que validar y sin lista blanca → sin Allow-Origin.
    assert resp.headers.get("access-control-allow-origin") is None


def test_cors_allows_vercel_preview_deployments():
    """Preview deployments https://*.vercel.app se reflejan sin estar en la lista."""
    app = _make_app_with_cors("https://www.quantbattle.co,http://localhost:3000")
    client = TestClient(app)

    # Preview deployment NO listado explícitamente → permitido por sufijo.
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://quant-ki13rynyx-emilio21.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://quant-ki13rynyx-emilio21.vercel.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"

    # Producción exacta → sigue permitida.
    resp_prod = client.options(
        "/health",
        headers={
            "Origin": "https://www.quantbattle.co",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp_prod.headers.get("access-control-allow-origin") == "https://www.quantbattle.co"

    # GET real (no preflight) con preview también refleja.
    resp_get = client.get(
        "/health",
        headers={"Origin": "https://quant-abc123-emilio21.vercel.app"},
    )
    assert resp_get.status_code == 200
    assert resp_get.headers.get("access-control-allow-origin") == "https://quant-abc123-emilio21.vercel.app"
    assert resp_get.headers.get("access-control-allow-credentials") == "true"


def test_cors_rejects_spoofed_vercel_and_null():
    """Solo https://*.vercel.app: http, spoof de sufijo y 'null' quedan cerrados."""
    app = _make_app_with_cors("https://www.quantbattle.co,http://localhost:3000")
    client = TestClient(app)

    bad_origins = [
        "http://foo.vercel.app",  # solo https
        "https://vercel.app.evil.com",  # sufijo falso
        "https://evil-vercel.app",  # dominio distinto
        "https://vercel.app",  # sin subdominio
        "null",  # nunca reflejar null
        "https://evil.com",  # fuera de lista
    ]
    for bad in bad_origins:
        resp = client.options(
            "/health",
            headers={"Origin": bad, "Access-Control-Request-Method": "GET"},
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") is None, bad
        assert resp.headers.get("access-control-allow-credentials") is None, bad