#!/usr/bin/env python3
"""Edge effect: register an OAuth 2.1 client against the Supabase Auth admin API.

This is the ONE place the irreversible POST happens. It is deliberately OUTSIDE
the kernel: the runtime adapter (lab/oauth.py) only builds the request as a
dry-run. This script imports that same request builder, so the dry-run and the
real call can never diverge.

Defaults to --dry-run (prints the request, sends nothing). Pass --execute to POST.

Env:
  SUPABASE_PROJECT_REF   e.g. abcdefgh  (or set SUPABASE_URL=https://<ref>.supabase.co)
  SUPABASE_SECRET_KEY    the service/secret key — server-side only, never in a client

Usage:
  python3 tools/register_oauth_client.py \
      --name "LAB Passport" \
      --redirect-uri https://passport.minilab.work/auth/callback \
      --client-type confidential --lab-id lab:abc123
  # add --execute to actually create it
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Run from anywhere: make the repo root importable so `lab` resolves.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lab.oauth import ADMIN_ENDPOINT, client_metadata  # noqa: E402


def base_url() -> str:
    url = os.environ.get("SUPABASE_URL")
    if url:
        return url.rstrip("/")
    ref = os.environ.get("SUPABASE_PROJECT_REF")
    if ref:
        return f"https://{ref}.supabase.co"
    sys.exit("error: set SUPABASE_URL or SUPABASE_PROJECT_REF")


def main() -> int:
    ap = argparse.ArgumentParser(description="Register a Supabase OAuth 2.1 client.")
    ap.add_argument("--name", required=True)
    ap.add_argument("--redirect-uri", action="append", dest="redirect_uris", required=True)
    ap.add_argument("--client-type", default="confidential", choices=["confidential", "public"])
    ap.add_argument("--auth-method", default=None)
    ap.add_argument("--lab-id", default=None)
    ap.add_argument("--scope", default="")
    ap.add_argument("--execute", action="store_true", help="actually POST (default is dry-run)")
    args = ap.parse_args()

    # Single source of truth: the same builder the kernel adapter uses.
    meta = client_metadata({
        "client_name": args.name,
        "redirect_uris": args.redirect_uris,
        "client_type": args.client_type,
        "token_endpoint_auth_method": args.auth_method,
        "scope": args.scope,
    })

    if not args.execute:
        print("DRY-RUN — nothing sent. Would POST to:")
        print(f"  {base_url() if (os.environ.get('SUPABASE_URL') or os.environ.get('SUPABASE_PROJECT_REF')) else '<project>'}{ADMIN_ENDPOINT}")
        print(json.dumps(meta, indent=2, sort_keys=True))
        print("\nRe-run with --execute (and SUPABASE_SECRET_KEY set) to create it.")
        return 0

    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not secret:
        sys.exit("error: SUPABASE_SECRET_KEY is required for --execute")

    req = urllib.request.Request(
        f"{base_url()}{ADMIN_ENDPOINT}",
        data=json.dumps(meta).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "apikey": secret,  # Supabase Auth admin requires both apikey and Bearer
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        sys.exit(f"error: Supabase returned {e.code}: {detail}")

    print("CREATED. Store these securely (the secret is shown once):")
    print(f"  client_id     = {body.get('client_id')}")
    if body.get("client_secret"):
        print(f"  client_secret = {body.get('client_secret')}")
    print(f"  lab_id        = {args.lab_id or '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
