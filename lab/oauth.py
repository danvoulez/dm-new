"""OAuth 2.1 client registration — request builder and dry-run adapter boundary.

Registering an OAuth client is an external effect at the *edge*: a POST to the
Supabase Auth admin API (``/auth/v1/admin/oauth/clients``). The kernel never
performs that call. This adapter builds the canonical RFC 7591 client-metadata
request *deterministically*, records what WOULD be sent, and returns AUX for a
result receipt — exactly as real model inference lives outside ``lab/inference.py``.

The actual HTTP effect lives in ``tools/register_oauth_client.py`` and imports
``client_metadata`` from here, so the dry-run request and the real call can never
diverge.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from .errors import AdapterError
from .receipt import canonical_json, sha256_text
from .store import append

ADMIN_ENDPOINT = "/auth/v1/admin/oauth/clients"

VALID_CLIENT_TYPES = {"public", "confidential"}
VALID_AUTH_METHODS = {"none", "client_secret_basic", "client_secret_post"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_auth_method(client_type: str, requested: str | None) -> str:
    """RFC 7591 §2: public clients MUST be ``none``; confidential clients MUST NOT.

    Defaults: public -> ``none``; confidential -> ``client_secret_basic``.
    """
    if client_type not in VALID_CLIENT_TYPES:
        raise AdapterError(f"schema-invalid: client_type must be one of {sorted(VALID_CLIENT_TYPES)}")
    if client_type == "public":
        if requested not in (None, "none"):
            raise AdapterError("schema-invalid: public clients must use token_endpoint_auth_method 'none'")
        return "none"
    # confidential
    method = requested or "client_secret_basic"
    if method == "none":
        raise AdapterError("schema-invalid: confidential clients cannot use token_endpoint_auth_method 'none'")
    if method not in VALID_AUTH_METHODS:
        raise AdapterError(f"schema-invalid: token_endpoint_auth_method must be one of {sorted(VALID_AUTH_METHODS)}")
    return method


def client_metadata(source: Mapping[str, Any]) -> dict[str, Any]:
    """Canonical RFC 7591 client metadata, derived deterministically from an Act."""
    name = source.get("client_name") or source.get("this") or ""
    if not isinstance(name, str) or not name:
        raise AdapterError("schema-invalid: client_name (or this) must be a non-empty string")
    redirect_uris = source.get("redirect_uris", [])
    if not isinstance(redirect_uris, list) or not redirect_uris:
        raise AdapterError("schema-invalid: redirect_uris must be a non-empty list")
    if not all(isinstance(u, str) and u for u in redirect_uris):
        raise AdapterError("schema-invalid: every redirect_uri must be a non-empty string")
    client_type = source.get("client_type", "confidential")
    auth_method = resolve_auth_method(client_type, source.get("token_endpoint_auth_method"))
    grant_types = source.get("grant_types") or ["authorization_code", "refresh_token"]
    return {
        "client_name": name,
        "client_type": client_type,
        "redirect_uris": list(redirect_uris),
        "grant_types": list(grant_types),
        "response_types": list(source.get("response_types") or ["code"]),
        "token_endpoint_auth_method": auth_method,
        "scope": source.get("scope", ""),
    }


def build_oauth_client_request(
    db,
    name: str,
    *,
    redirect_uris: Sequence[str],
    client_type: str = "confidential",
    token_endpoint_auth_method: str | None = None,
    lab_id: str | None = None,
    grant_types: Sequence[str] | None = None,
    scope: str = "",
):
    """Register the *intent* to create an OAuth client as a candidate Act.

    Consequence still flows through queue -> executor -> adapter; nothing is sent here.
    """
    fields: dict[str, Any] = {
        "who": "lab.cli",
        "did": "requested_oauth_client",
        "this": name,
        "when": now(),
        "confirmed_by": "lab.cli",
        "if_ok": "oauth-client.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "no_oauth_server",
        "status": "candidate",
        "client_name": name,
        "redirect_uris": list(redirect_uris),
        "client_type": client_type,
        "scope": scope,
        "api_called": False,
    }
    if token_endpoint_auth_method is not None:
        fields["token_endpoint_auth_method"] = token_endpoint_auth_method
    if grant_types is not None:
        fields["grant_types"] = list(grant_types)
    if lab_id is not None:
        fields["lab_id"] = lab_id
    return append(db, fields)


def run_oauth_client_adapter(source: Mapping[str, Any], queue_item: Mapping[str, Any]) -> dict[str, Any]:
    meta = client_metadata(source)
    metadata_hash = sha256_text(canonical_json(meta))
    request = {"method": "POST", "endpoint": ADMIN_ENDPOINT, "client_metadata": meta}
    request_hash = sha256_text(canonical_json(request))
    candidate = {
        "who": "oauth.client.adapter",
        "did": "candidate.oauth_client_request",
        "this": source.get("id", queue_item.get("source_hash", "")),
        "when": now(),
        "confirmed_by": "oauth.dry_run",
        "if_ok": "attention-raise.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "discard_candidate",
        "status": "candidate",
        "lab_id": source.get("lab_id", ""),
        "request_hash": request_hash,
        "client_metadata_hash": metadata_hash,
    }
    return {
        "adapter_class": "oauth.client_registration.dry_run",
        "external_effect": False,
        "api_called": False,
        "endpoint": ADMIN_ENDPOINT,
        "client_name": meta["client_name"],
        "client_type": meta["client_type"],
        "token_endpoint_auth_method": meta["token_endpoint_auth_method"],
        "redirect_uris": meta["redirect_uris"],
        "lab_id": source.get("lab_id", ""),
        "client_metadata_hash": metadata_hash,
        "request_hash": request_hash,
        "metadata_valid": True,
        "candidate_acts": [candidate],
    }
