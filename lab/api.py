"""HTTP surface for a user interface.

The runtime had no callable surface but the CLI and the Python API, so no interface
could exist. This module is that surface, and it is deliberately narrow.

Two rules shape it:

**Reads cannot write.** Every read endpoint goes through :mod:`lab.inspect` or plain
``SELECT``s. Nothing in the read path can advance the ledger.

**Registering is unconditional; activating is not.** ``POST /api/register`` always
appends. It does not decide whether the arrival deserves to exist — that is not a
decision this layer, or any layer, gets to make. It returns the receipt *and* the
evaluator's verdict as two separate facts, so an interface can say "registered" and
"moving" (or "registered" and "waiting for X") without ever fusing them.

Zero pip dependencies, matching the kernel: :mod:`http.server` and :mod:`json`.
This is a reference implementation meant for a local UI and for making
``docs/API.md`` verifiable — put a real server in front of it for anything else.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

from .adapters import REGISTRY
from .contracts import load_catalog
from .errors import LabError, NotFound
from .evaluator import evaluate
from .grants import grant_detail, list_grants, record_grant_signoff, register_grant, revoke_grant
from .inspect import inspect_hash
from .messages import catalog as message_catalog
from .messages import render as render_message
from .process_catalog import build_runnable_processes
from .projections import ensure_projections
from .receipt import SLOTS
from .runtime import DOUBT_REASONS, ensure_runtime, executor_run_once, receiver_select
from .store import append, connect, count, get

DEFAULT_DB = os.environ.get("LAB_DB", ".lab/lab.sqlite")

# Receipts the runtime writes when work could not move. Each carries a `reason` from
# the closed vocabulary, which is what makes a real message catalog possible.
PENDENCY_DIDS = ("doubt", "not_dispatched", "evidence_incomplete", "adapter_doubted")
CLOSED_DIDS = ("fechado", "llm.receipt")
CANDIDATE_STATUS = "candidate"

# What the timeline calls each receipt, in the interface's language rather than the
# runtime's. Anything not listed falls back to the raw did under a neutral label.
TIMELINE_LABELS = {
    "queued": "Na fila",
    "dispatching": "Executando",
    "fechado": "Concluído",
    "llm.receipt": "Concluído",
    "doubt": "Parado",
    "not_dispatched": "Parado",
    "evidence_incomplete": "Parado sem comprovação",
    "adapter_doubted": "Parado",
}


class ApiError(LabError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# --------------------------------------------------------------------------- reads


def _acts(db: sqlite3.Connection, *, dids=(), statuses=(), limit: int = 50, since: str | None = None):
    clauses: list[str] = []
    params: list[Any] = []
    if dids:
        clauses.append(f"did IN ({','.join('?' * len(dids))})")
        params.extend(dids)
    if statuses:
        clauses.append(f"status IN ({','.join('?' * len(statuses))})")
        params.extend(statuses)
    if since:
        clauses.append("inserted_at >= ?")
        params.append(since)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    rows = db.execute(
        f"SELECT act FROM logline_acts {where} ORDER BY inserted_at DESC, content_hash DESC LIMIT ?",
        params,
    ).fetchall()
    return [json.loads(row["act"]) for row in rows]


def _fingerprint(content_hash: str | None) -> str | None:
    """What a person sees instead of 64 hex characters."""
    return content_hash[:8] if content_hash else None


def _pendency(receipt: dict[str, Any]) -> dict[str, Any]:
    reason = receipt.get("reason") or "unknown"
    rendered = render_message(reason, receipt)
    return {
        "id": receipt.get("id"),
        "fingerprint": _fingerprint(receipt.get("id")),
        "source_hash": receipt.get("this"),
        "source_fingerprint": _fingerprint(receipt.get("this")),
        "process_id": receipt.get("process_id"),
        "when": receipt.get("when"),
        "danger_tier": receipt.get("danger_tier"),
        "missing": receipt.get("missing_aux") or receipt.get("missing_slots") or [],
        "missing_evidence": receipt.get("missing_evidence") or [],
        **rendered,
    }


def health(db: sqlite3.Connection, read_only: bool) -> dict[str, Any]:
    return {
        "ok": True,
        "ledger": "logline_acts",
        "acts": count(db),
        "read_only": read_only,
        "process_types": len(load_catalog()),
        "adapters": sorted(REGISTRY),
        "doubt_reasons": len(DOUBT_REASONS),
    }


def vocabulary() -> dict[str, Any]:
    """The failure vocabulary with its human messages.

    An interface should render from this rather than hardcode 27 strings, so adding a
    reason to the runtime surfaces in the UI without a frontend release.
    """
    return {"count": len(message_catalog()), "reasons": message_catalog()}


def process_types() -> dict[str, Any]:
    """The catalog as a form generator sees it: what each type is, and what it needs."""
    catalog = load_catalog()
    readiness = {item["process_id"]: item for item in build_runnable_processes()["processes"]}
    types = []
    for process_id, contract in sorted(catalog.items()):
        state = readiness.get(process_id, {})
        types.append({
            "process_id": process_id,
            "title": contract.title or process_id,
            "requires": list(contract.must_include),
            "accepts": list(contract.optional_aux),
            "required_slots": list(contract.required_slots),
            "adapter": contract.adapters[0] if contract.adapters else None,
            "danger_tier": state.get("danger_tier", contract.danger_tier),
            "needs_approval": state.get("danger_tier", contract.danger_tier) in {"L4", "L5"},
            "irreversible": state.get("danger_tier", contract.danger_tier) == "L5",
            "runnable": state.get("status") == "runnable",
            "readiness": state.get("status", "unknown"),
            "readiness_reason": state.get("reason", ""),
            "evidence_must_include": list(contract.evidence_must_include),
        })
    return {"count": len(types), "types": types}


def now_view(db: sqlite3.Connection, *, limit: int = 20) -> dict[str, Any]:
    """The three questions the home screen answers, and nothing else."""
    since = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    pendencies = [_pendency(receipt) for receipt in _acts(db, dids=PENDENCY_DIDS, limit=limit)]
    return {
        "needs_you": [item for item in pendencies if item["resolved_by"] == "user"],
        "needs_operator": [item for item in pendencies if item["resolved_by"] == "operator"],
        "moving": [
            {
                "source_hash": receipt.get("this"),
                "fingerprint": _fingerprint(receipt.get("this")),
                "process_id": receipt.get("process_id"),
                "when": receipt.get("when"),
            }
            for receipt in _acts(db, dids=("queued", "dispatching"), limit=limit)
        ],
        "closed_today": [
            {
                "source_hash": receipt.get("this"),
                "result_hash": receipt.get("id"),
                "fingerprint": _fingerprint(receipt.get("id")),
                "process_id": receipt.get("process_id"),
                "when": receipt.get("when"),
            }
            for receipt in _acts(db, dids=CLOSED_DIDS, limit=limit, since=since)
        ],
    }


def pendencies(db: sqlite3.Connection, *, limit: int = 50, resolved_by: str | None = None) -> dict[str, Any]:
    items = [_pendency(receipt) for receipt in _acts(db, dids=PENDENCY_DIDS, limit=limit)]
    if resolved_by:
        items = [item for item in items if item["resolved_by"] == resolved_by]
    return {"count": len(items), "pendencies": items}


def case(db: sqlite3.Connection, content_hash: str) -> dict[str, Any]:
    """One arrival and everything that descended from it, as a timeline.

    The detail comes from :mod:`lab.inspect`, whose whole contract is that it only
    ever issues SELECTs — no verb on this path can advance the ledger.
    """
    source = get(db, content_hash)
    if source is None:
        raise ApiError(f"case not found: {content_hash}", 404)
    detail = inspect_hash(db, content_hash)
    descendants = [
        json.loads(row["act"])
        for row in db.execute(
            "SELECT act FROM logline_acts WHERE json_extract(act,'$.this') = ? "
            "ORDER BY inserted_at, content_hash",
            (content_hash,),
        ).fetchall()
    ]

    timeline = [{
        "step": "registered",
        "label": "Registrado",
        "when": source.get("when"),
        "hash": content_hash,
        "fingerprint": _fingerprint(content_hash),
    }]
    for receipt in descendants:
        did = receipt.get("did", "")
        entry = {
            "step": did,
            "label": TIMELINE_LABELS.get(did, did),
            "when": receipt.get("when"),
            "hash": receipt.get("id"),
            "fingerprint": _fingerprint(receipt.get("id")),
        }
        if receipt.get("reason"):
            entry.update(render_message(receipt["reason"], receipt))
        timeline.append(entry)

    return {
        "hash": content_hash,
        "fingerprint": _fingerprint(content_hash),
        "found": True,
        "valid": detail.get("validation", {}).get("ok", False),
        "slots": {slot: source.get(slot, "") for slot in SLOTS},
        "fields": {
            key: value for key, value in source.items()
            if key not in SLOTS and key not in {"id", "hashes", "receipt_version", "json_canonicalization"}
        },
        "timeline": timeline,
        "came_from": detail.get("source_refs", []),
        "produced": [
            {"hash": receipt.get("id"), "fingerprint": _fingerprint(receipt.get("id")), "did": receipt.get("did")}
            for receipt in descendants
        ],
    }


def candidates(db: sqlite3.Connection, *, limit: int = 50) -> dict[str, Any]:
    items = _acts(db, statuses=(CANDIDATE_STATUS,), limit=limit)
    return {
        "count": len(items),
        "candidates": [
            {
                "id": receipt.get("id"),
                "fingerprint": _fingerprint(receipt.get("id")),
                "did": receipt.get("did"),
                "when": receipt.get("when"),
                "schema_id": receipt.get("schema_id"),
                "payload": receipt.get("candidate_payload") or receipt.get("proposal"),
                "citations": (receipt.get("candidate_payload") or {}).get("citations", [])
                if isinstance(receipt.get("candidate_payload"), dict) else [],
                "activates_process": receipt.get("activates_process", False),
            }
            for receipt in items
        ],
    }


def projections(db: sqlite3.Connection, *, limit: int = 50) -> dict[str, Any]:
    ensure_projections(db)
    rows = db.execute(
        "SELECT projection_hash, projection_spec, class, computed_at FROM projection_docs "
        "ORDER BY computed_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return {
        "count": len(rows),
        "note": "Resumos reconstruíveis. Não são a fonte.",
        "projections": [
            {
                "projection_hash": row["projection_hash"],
                "fingerprint": _fingerprint(row["projection_hash"]),
                "spec": row["projection_spec"],
                "class": row["class"],
                "computed_at": row["computed_at"],
                "authoritative": False,
                "rebuildable": True,
            }
            for row in rows
        ],
    }


def grants_view(db: sqlite3.Connection, *, limit: int = 20) -> dict[str, Any]:
    items = list_grants(db, limit=limit)
    for item in items:
        item["fingerprint"] = _fingerprint(item.get("grant_id"))
    return {"count": len(items), "grants": items}


# -------------------------------------------------------------------------- writes


def register(db: sqlite3.Connection, body: dict[str, Any]) -> dict[str, Any]:
    """Register an arrival, then report what the activation law made of it.

    There is no admission decision here. The act is appended first, unconditionally;
    the verdict is computed afterwards and returned alongside, never instead.
    """
    if not isinstance(body, dict):
        raise ApiError("body must be a JSON object")
    fields = {key: value for key, value in body.items() if key not in {"id", "hashes"}}
    for slot in SLOTS:
        fields.setdefault(slot, "")
    if not fields.get("when"):
        fields["when"] = datetime.now(timezone.utc).isoformat()
    if not str(fields.get("who", "")):
        raise ApiError("who is required: an act is authored by someone")

    receipt = append(db, fields)
    # Evaluate exactly as the receiver will, with no forced process id, so the verdict
    # reported here and the doubt the selector writes can never disagree.
    decision = evaluate(receipt)

    # Run the selector either way. It queues what activates and writes a durable doubt
    # for what does not — an arrival that cannot move must still leave a trace an
    # interface can show, or "nothing is lost" is only true of the ledger and not of
    # the screen.
    moved = None
    if receipt.get("if_ok"):
        ensure_runtime(db)
        receiver_select(db, receipt["if_ok"], limit=50)
        moved = bool(decision.get("activate"))
    outcome = {
        "registered": True,
        "id": receipt["id"],
        "fingerprint": _fingerprint(receipt["id"]),
        "receipt": receipt,
        "activated": bool(decision.get("activate")),
        "process_id": decision.get("process_id"),
        "danger_tier": decision.get("danger_tier"),
        "queued": moved,
    }
    if not decision.get("activate"):
        outcome["waiting"] = render_message(decision.get("reason", "unknown"), decision)
        outcome["missing"] = decision.get("missing_aux") or decision.get("missing_slots") or []
    return outcome


def advance(db: sqlite3.Connection, body: dict[str, Any]) -> dict[str, Any]:
    """Run one executor turn. Exposed so a local UI can show movement without a daemon."""
    ensure_runtime(db)
    result = executor_run_once(db, str(body.get("worker") or "api"))
    if result is None:
        return {"ran": False, "note": "nada na fila"}
    return {"ran": True, "queue": result}


# -------------------------------------------------------------------------- routing

Route = tuple[str, re.Pattern[str], Callable[..., Any], bool]


def _routes() -> list[Route]:
    """(method, path pattern, handler, writes) — `writes` drives --read-only."""
    return [
        ("GET", re.compile(r"^/api/health$"), lambda db, q, b, ro: health(db, ro), False),
        ("GET", re.compile(r"^/api/vocabulary$"), lambda db, q, b, ro: vocabulary(), False),
        ("GET", re.compile(r"^/api/process-types$"), lambda db, q, b, ro: process_types(), False),
        ("GET", re.compile(r"^/api/now$"), lambda db, q, b, ro: now_view(db, limit=_int(q, "limit", 20)), False),
        ("GET", re.compile(r"^/api/pendencies$"), lambda db, q, b, ro: pendencies(
            db, limit=_int(q, "limit", 50), resolved_by=_one(q, "resolved_by")), False),
        ("GET", re.compile(r"^/api/cases/(?P<hash>[0-9a-f]{64})$"), lambda db, q, b, ro, hash: case(db, hash), False),
        ("GET", re.compile(r"^/api/candidates$"), lambda db, q, b, ro: candidates(db, limit=_int(q, "limit", 50)), False),
        ("GET", re.compile(r"^/api/projections$"), lambda db, q, b, ro: projections(db, limit=_int(q, "limit", 50)), False),
        ("GET", re.compile(r"^/api/grants$"), lambda db, q, b, ro: grants_view(db, limit=_int(q, "limit", 20)), False),
        ("GET", re.compile(r"^/api/grants/(?P<gid>[0-9a-f]{64})$"), lambda db, q, b, ro, gid: grant_detail(db, gid), False),
        ("POST", re.compile(r"^/api/register$"), lambda db, q, b, ro: register(db, b), True),
        ("POST", re.compile(r"^/api/advance$"), lambda db, q, b, ro: advance(db, b), True),
        ("POST", re.compile(r"^/api/grants$"), lambda db, q, b, ro: register_grant(
            db,
            process=_need(b, "process"),
            granted_by=_need(b, "granted_by"),
            granted_to=_need(b, "granted_to"),
            adapter=b.get("adapter", "*"),
            valid_until=b.get("valid_until", ""),
            acu_limit=int(b.get("acu_limit") or 0),
            timeout_seconds=int(b.get("timeout_seconds") or 0),
            fs_scope=b.get("fs_scope", ""),
            network_policy=b.get("network_policy", "none"),
        ), True),
        ("POST", re.compile(r"^/api/grants/(?P<gid>[0-9a-f]{64})/signoff$"), lambda db, q, b, ro, gid:
            record_grant_signoff(db, gid, signer=_need(b, "signer"), credential=_need(b, "credential")), True),
        ("POST", re.compile(r"^/api/grants/(?P<gid>[0-9a-f]{64})/revoke$"), lambda db, q, b, ro, gid:
            revoke_grant(db, gid, revoked_by=_need(b, "revoked_by"), reason=b.get("reason", "revoked")), True),
    ]


def _int(query: dict[str, list[str]], key: str, default: int) -> int:
    values = query.get(key)
    if not values:
        return default
    try:
        return max(1, min(500, int(values[0])))
    except ValueError as exc:
        raise ApiError(f"{key} must be an integer") from exc


def _one(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    return values[0] if values else None


def _need(body: dict[str, Any], key: str) -> str:
    value = body.get(key)
    if not value:
        raise ApiError(f"{key} is required")
    return str(value)


def dispatch(method: str, path: str, query: dict, body: dict, *, db, read_only: bool) -> tuple[int, Any]:
    """Route one request. Separated from the HTTP layer so it is directly testable."""
    matched_path = False
    for route_method, pattern, handler, writes in _routes():
        match = pattern.match(path)
        if not match:
            continue
        matched_path = True
        if route_method != method:
            continue
        if writes and read_only:
            return 403, {"error": "server is read-only", "code": "read_only"}
        try:
            return 200, handler(db, query, body, read_only, **match.groupdict())
        except ApiError as exc:
            return exc.status, {"error": str(exc), "code": "bad_request"}
        except NotFound as exc:
            return 404, {"error": str(exc), "code": "not_found"}
        except LabError as exc:
            return 400, {"error": str(exc), "code": "lab_error"}
    return (405 if matched_path else 404), {
        "error": "method not allowed" if matched_path else f"no route for {path}",
        "code": "method_not_allowed" if matched_path else "no_route",
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "lab-api"
    db_path = DEFAULT_DB
    read_only = False

    def _respond(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # Local development UI runs on another port; the server binds to loopback by
        # default, so this does not widen exposure beyond the machine.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _handle(self, method: str) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self._respond(400, {"error": "body is not valid JSON", "code": "bad_json"})
            return
        db = connect(self.db_path)
        try:
            status, payload = dispatch(
                method, parsed.path, parse_qs(parsed.query), body,
                db=db, read_only=self.read_only,
            )
        finally:
            db.close()
        self._respond(status, payload)

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        self._handle("POST")

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server API
        self._respond(204, "")

    def log_message(self, fmt: str, *args: Any) -> None:
        return  # the ledger is the record; request logs are noise


def serve(*, host: str = "127.0.0.1", port: int = 8787, read_only: bool = False, db_path: str | None = None) -> dict:
    Handler.db_path = db_path or DEFAULT_DB
    Handler.read_only = read_only
    server = ThreadingHTTPServer((host, port), Handler)
    print(json.dumps({
        "serving": f"http://{host}:{port}",
        "db": Handler.db_path,
        "read_only": read_only,
        "routes": sorted({pattern.pattern for _, pattern, _, _ in _routes()}),
    }, indent=2, sort_keys=True))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return {"stopped": True}
