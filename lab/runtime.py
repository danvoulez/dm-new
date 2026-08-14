"""Production-grade local runtime tree for selectors, queue, and executor."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from .adapters import REGISTRY, run_adapter
from .errors import AdapterError, Conflict, NotFound
from .evaluator import evaluate
from .grants import require_grant_signoff, resolve_grant, verify_grant
from .store import append, get, require, transaction

QUEUE_STATUSES = {"queued", "claimed", "closed", "failed", "released"}
DANGEROUS_TIERS = {"L4", "L5"}
DOUBT_DID = "doubt"

# Canonical, closed vocabulary of *why* an Act does not become a clean dispatch. A doubt
# is never a generic error: it names the exact procedural barrier so a future LLM can
# recognize the state without parsing free text (LAB roadmap, Dia 1 §11). The granular
# grant reasons are intentionally finer than the spec's "grant_invalid" family — they say
# precisely which grant invariant failed.
# Grouped by mold family (see docs/RECEIPT_MOLDS.md). Kept exhaustive: every reason the
# selector/executor/grant/authority/signature layers can emit must appear here, so a future
# LLM recognizes states without parsing free text. test_receipt_molds.py pins completeness.
DOUBT_REASONS = frozenset({
    # contract / activation
    "unknown_process",
    "process_route_mismatch",
    "process_not_active",            # spec: process_not_runnable
    "incomplete",                    # spec: missing_required_fields
    "activation_rules_not_explicit",
    "did_not_admitted",
    "who_not_authorized",
    "confirmed_by_not_authorized",
    "this_not_canonical",
    "this_not_content_hash",
    "when_invalid",
    "when_not_future",
    "confirmation_evidence_invalid",
    "if_ok_incompatible",
    "if_doubt_incompatible",
    "if_not_incompatible",
    "status_initial_invalid",
    "unknown_predicate",
    # adapter
    "no_adapter_configured",         # contract names no adapter at all
    "adapter_not_registered",        # contract names an adapter with no implementation
    "dispatch_mismatch",             # queued adapter disagrees with the contract
    # grant required (spec family: grant_required)
    "missing_required_grant",
    # grant invalid (spec family: grant_invalid), made precise
    "grant_not_found",
    "grant_subject_mismatch",
    "grant_process_mismatch",
    "grant_adapter_mismatch",
    "grant_not_active",
    "grant_revoked",
    "grant_expired",
    "missing_grant_expiry",
    "missing_timeout",
    "missing_sandbox_scope",
    "missing_network_policy",
    "budget_exhausted",
    # authority / signature binding
    "missing_authority",
    "unregistered_authority",
    "grant_unsigned",
    "signoff_signer_mismatch",
    "signature_layer_unavailable",
    # evidence
    "evidence_obligation_unmet",     # spec: evidence_incomplete
    "adapter_rejected",              # adapter/model/schema boundary refused safely
})
ADAPTER_ACU_COST = {
    "worker_run": 1,
    "workflow_run": 1,
}

QUEUE_DDL = """
CREATE TABLE IF NOT EXISTS runtime_queue (
  queue_id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  process_id TEXT NOT NULL,
  adapter TEXT NOT NULL DEFAULT 'receipt',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','claimed','closed','failed','released')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  result_hash TEXT,
  last_error TEXT,
  UNIQUE(source_hash, process_id, adapter)
);
CREATE INDEX IF NOT EXISTS runtime_queue_status_idx ON runtime_queue(status, created_at);
CREATE TABLE IF NOT EXISTS runtime_service_state (
  service_name TEXT PRIMARY KEY,
  paused INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  updated_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def clock_now() -> dict[str, Any]:
    return {"selector": "clock", "now": now(), "effect": "no_direct_execution"}


def _existing_doubt(db: sqlite3.Connection, source_hash: str) -> str | None:
    row = db.execute(
        "SELECT content_hash FROM logline_acts WHERE did = ? AND this = ? LIMIT 1",
        (DOUBT_DID, source_hash),
    ).fetchone()
    return row["content_hash"] if row else None


def _unregistered_adapter_block(decision: dict[str, Any]) -> dict[str, Any]:
    """Demote an activatable decision whose adapter has no registered implementation.

    A contract may name an adapter that does not yet exist in the registry (e.g.
    ``route_to_devin``). That is "no real adapter" per the activation law: it is not
    runnable and must fail closed as a durable ``adapter_not_registered`` doubt rather
    than enqueue and crash at dispatch. Keeps the runtime in agreement with the
    generated runnable-process catalog (``process_catalog._readiness``).
    """
    blocked = dict(decision)
    blocked.update({
        "activate": False,
        "queueable": False,
        "activation_state": "doubted",
        "reason": "adapter_not_registered",
    })
    return blocked


def raise_doubt(
    db: sqlite3.Connection,
    source_hash: str,
    decision: dict[str, Any],
    *,
    who: str,
    frequency: str | None = None,
) -> dict[str, Any] | None:
    """Write a durable, idempotent doubt for an addressed tap that cannot be served.

    A row only reaches a selector because it addressed a real frequency — a tap rang.
    If it does not activate, the tap must leave a durable trace rather than vanish as
    an in-memory decision. Universal Inbox v3 §6: every tap is receipted; LAB FINAL
    spec: no wake-spec / no matching contract -> doubted/attention, never silent
    failure. (Wild, unaddressed noise never reaches a selector, so this cannot ring a
    bell for the inert rows v3 deliberately keeps quiet.)

    Idempotent per source so cold-start / catch-up re-pulls do not duplicate doubts.
    """
    existing = _existing_doubt(db, source_hash)
    if existing:
        return get(db, existing)
    fields: dict[str, Any] = {
        "who": who,
        "did": DOUBT_DID,
        "this": source_hash,
        "when": now(),
        "confirmed_by": "lab.runtime",
        "if_ok": "attention-raise.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "executor.skip",
        "status": "doubted",
        "reason": decision.get("reason", "not_activatable"),
        "activation_state": decision.get("activation_state"),
        "missing_slots": decision.get("missing_slots", []),
        "missing_aux": decision.get("missing_aux", []),
        "danger_tier": decision.get("danger_tier"),
        "process_id": decision.get("process_id"),
        "evaluation": decision,
    }
    if frequency is not None:
        fields["frequency"] = frequency
    return append(db, fields)


def clock_select_due(
    db: sqlite3.Connection,
    *,
    now_at: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Selector-only clock: queue complete scheduled records that are due."""
    ensure_runtime(db)
    end = parse_time(to_time) or parse_time(now_at) or datetime.now(timezone.utc)
    start = parse_time(from_time)
    rows = db.execute(
        "SELECT content_hash, act FROM logline_acts WHERE status = 'scheduled' ORDER BY when_slot, inserted_at, content_hash LIMIT ?",
        (limit,),
    ).fetchall()
    selected: list[dict[str, Any]] = []
    for row in rows:
        receipt = json.loads(row["act"])
        scheduled_at = parse_time(receipt.get("when"))
        if scheduled_at is None or scheduled_at > end:
            continue
        if start is not None and scheduled_at < start:
            continue
        process_id = receipt.get("process_id")
        decision = evaluate(receipt, process_id)
        queued = None
        doubt = None
        if decision.get("activate") and decision["adapter"] not in REGISTRY:
            decision = _unregistered_adapter_block(decision)
        if decision.get("activate"):
            queued = queue_add(db, row["content_hash"], decision["process_id"], decision["adapter"])
        else:
            doubt = raise_doubt(db, row["content_hash"], decision, who="runtime.clock", frequency=process_id)
        selected.append({
            "hash": row["content_hash"],
            "scheduled_at": receipt.get("when"),
            "evaluation": decision,
            "queued": queued,
            "doubt": doubt["id"] if doubt else None,
        })
    return selected


def queue_rebuild_due(
    db: sqlite3.Connection,
    *,
    now_at: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Rebuild queued due scheduled work from the authoritative ledger.

    ``runtime_queue`` is a projection. If it is dropped or corrupted, due scheduled
    receipts in ``logline_acts`` remain authority. Rebuilding recreates the queue
    table and re-applies the selector-only clock path; idempotency still comes from
    ``UNIQUE(source_hash, process_id, adapter)``.
    """
    ensure_runtime(db)
    selected = clock_select_due(db, now_at=now_at, from_time=from_time, to_time=to_time, limit=limit)
    queued = [item for item in selected if item.get("queued")]
    return {
        "projection": "runtime_queue",
        "authoritative": False,
        "rebuilt_from": "logline_acts",
        "selected": len(selected),
        "queued": len(queued),
        "items": selected,
    }


def ensure_runtime(db: sqlite3.Connection) -> None:
    db.executescript(QUEUE_DDL)
    db.commit()


def _row_to_item(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def inspect_queue(db: sqlite3.Connection, queue_id: str) -> dict[str, Any] | None:
    ensure_runtime(db)
    row = db.execute("SELECT * FROM runtime_queue WHERE queue_id = ?", (queue_id,)).fetchone()
    return _row_to_item(row)


def queue_add(db: sqlite3.Connection, source_hash: str, process_id: str = "memory-register.v1", adapter: str = "receipt") -> dict[str, Any]:
    ensure_runtime(db)
    require(db, source_hash)
    existing = db.execute(
        "SELECT * FROM runtime_queue WHERE source_hash = ? AND process_id = ? AND adapter = ?",
        (source_hash, process_id, adapter),
    ).fetchone()
    if existing:
        return dict(existing)
    queue_id = f"queue:{uuid.uuid4().hex}"
    timestamp = now()
    with transaction(db):
        db.execute(
            """INSERT INTO runtime_queue(queue_id, source_hash, process_id, adapter, created_at, updated_at)
               VALUES(?, ?, ?, ?, ?, ?)""",
            (queue_id, source_hash, process_id, adapter, timestamp, timestamp),
        )
        append(
            db,
            {
                "who": "runtime.queue",
                "did": "queued",
                "this": source_hash,
                "when": timestamp,
                "confirmed_by": "lab.runtime",
                "if_ok": queue_id,
                "if_doubt": "attention-raise.v1",
                "if_not": "executor.skip",
                "status": "queued",
                "process_id": process_id,
                "queue_id": queue_id,
                "adapter": adapter,
            },
            commit=False,
        )
    item = inspect_queue(db, queue_id)
    if item is None:
        raise NotFound(f"queue item disappeared after insert: {queue_id}")
    return item


def _claimed_rows(cursor: sqlite3.Cursor) -> int:
    return cursor.rowcount if cursor.rowcount is not None else 0


def queue_list(db: sqlite3.Connection, status: str = "queued", limit: int = 20) -> list[dict[str, Any]]:
    ensure_runtime(db)
    if status != "all" and status not in QUEUE_STATUSES:
        raise ValueError(f"unknown queue status: {status}")
    rows = db.execute(
        """SELECT * FROM runtime_queue
           WHERE (? = 'all' OR status = ?)
           ORDER BY created_at, queue_id
           LIMIT ?""",
        (status, status, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def claim(db: sqlite3.Connection, worker: str = "executor") -> dict[str, Any] | None:
    ensure_runtime(db)
    timestamp = now()
    with transaction(db):
        row = db.execute(
            "SELECT * FROM runtime_queue WHERE status = 'queued' ORDER BY created_at, queue_id LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        cursor = db.execute(
            """UPDATE runtime_queue
               SET status = 'claimed', claimed_by = ?, attempts = attempts + 1, updated_at = ?
               WHERE queue_id = ? AND status = 'queued'""",
            (worker, timestamp, row["queue_id"]),
        )
        # The WHERE guard is the lock; this is where we find out whether we won it.
        # Without checking, a worker that lost the race to another executor still
        # received the row and would dispatch it a second time.
        if _claimed_rows(cursor) == 0:
            return None
    return inspect_queue(db, row["queue_id"])


def release(db: sqlite3.Connection, queue_id: str, *, reason: str = "released") -> dict[str, Any]:
    item = inspect_queue(db, queue_id)
    if item is None:
        raise NotFound(f"queue item not found: {queue_id}")
    if item["status"] != "claimed":
        raise Conflict(f"only claimed queue items can be released; current={item['status']}")
    db.execute(
        "UPDATE runtime_queue SET status = 'queued', claimed_by = NULL, last_error = ?, updated_at = ? WHERE queue_id = ?",
        (reason, now(), queue_id),
    )
    db.commit()
    return inspect_queue(db, queue_id) or item


def close(db: sqlite3.Connection, queue_id: str, result_hash: str) -> dict[str, Any]:
    require(db, result_hash)
    item = inspect_queue(db, queue_id)
    if item is None:
        raise NotFound(f"queue item not found: {queue_id}")
    db.execute(
        "UPDATE runtime_queue SET status = 'closed', result_hash = ?, updated_at = ? WHERE queue_id = ?",
        (result_hash, now(), queue_id),
    )
    db.commit()
    return inspect_queue(db, queue_id) or item


def fail(db: sqlite3.Connection, queue_id: str, error: str) -> dict[str, Any]:
    item = inspect_queue(db, queue_id)
    if item is None:
        raise NotFound(f"queue item not found: {queue_id}")
    db.execute(
        "UPDATE runtime_queue SET status = 'failed', last_error = ?, updated_at = ? WHERE queue_id = ?",
        (error, now(), queue_id),
    )
    db.commit()
    return inspect_queue(db, queue_id) or item


def receiver_select(db: sqlite3.Connection, frequency: str, limit: int = 20) -> list[dict[str, Any]]:
    """Selector-only receiver: evaluate addressed rows and queue activatable work."""
    ensure_runtime(db)
    rows = db.execute(
        "SELECT content_hash, act FROM logline_acts WHERE json_extract(act, '$.process_id') = ? ORDER BY inserted_at, content_hash LIMIT ?",
        (frequency, limit),
    ).fetchall()
    selected: list[dict[str, Any]] = []
    for row in rows:
        receipt = json.loads(row["act"])
        decision = evaluate(receipt)
        queued = None
        doubt = None
        if decision.get("activate") and decision["adapter"] not in REGISTRY:
            decision = _unregistered_adapter_block(decision)
        if decision.get("activate"):
            queued = queue_add(db, row["content_hash"], decision["process_id"], decision["adapter"])
        else:
            doubt = raise_doubt(db, row["content_hash"], decision, who="runtime.receiver", frequency=frequency)
        selected.append({
            "hash": row["content_hash"],
            "evaluation": decision,
            "queued": queued,
            "doubt": doubt["id"] if doubt else None,
        })
    return selected


def set_service_paused(db: sqlite3.Connection, service_name: str, paused: bool, reason: str = "") -> dict[str, Any]:
    ensure_runtime(db)
    db.execute(
        """INSERT INTO runtime_service_state(service_name, paused, reason, updated_at)
           VALUES(?, ?, ?, ?)
           ON CONFLICT(service_name) DO UPDATE SET paused = excluded.paused, reason = excluded.reason, updated_at = excluded.updated_at""",
        (service_name, int(paused), reason, now()),
    )
    db.commit()
    return service_state(db, service_name)


def service_state(db: sqlite3.Connection, service_name: str) -> dict[str, Any]:
    ensure_runtime(db)
    row = db.execute("SELECT * FROM runtime_service_state WHERE service_name = ?", (service_name,)).fetchone()
    return dict(row) if row else {"service_name": service_name, "paused": 0, "reason": None, "updated_at": None}


def close_without_dispatch(db: sqlite3.Connection, item: dict[str, Any], decision: dict[str, Any], worker: str) -> dict[str, Any]:
    status = decision.get("activation_state") or "doubted"
    if status == "ativável":
        status = "doubted"
    result = append(
        db,
        {
            "who": "runtime.executor",
            "did": "not_dispatched",
            "this": item["source_hash"],
            "when": now(),
            "confirmed_by": worker,
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "executor.skip",
            "status": status,
            "process_id": item["process_id"],
            "queue_id": item["queue_id"],
            "adapter": item["adapter"],
            "reason": decision.get("reason", "not_activatable"),
            "missing_slots": decision.get("missing_slots", []),
            "missing_aux": decision.get("missing_aux", []),
            "danger_tier": decision.get("danger_tier"),
            "budget_required": decision.get("budget_required"),
            "evaluation": decision,
        },
    )
    return close(db, item["queue_id"], result["id"])


def _evidence_present(value: Any) -> bool:
    return value not in (None, "", [], {}, ())


def missing_evidence(evidence_must_include, result_aux: dict[str, Any]) -> list[str]:
    """Fields a contract's evidence obligation demands that the result does not carry."""
    return [field for field in evidence_must_include if not _evidence_present(result_aux.get(field))]


def materialize_adapter_outputs(db: sqlite3.Connection, adapter_aux: dict[str, Any]) -> dict[str, Any]:
    """Materialize governed adapter proposals and return receipt-safe evidence.

    Adapters are leaves: they return requests/candidates but do not write durable state.
    The executor owns this boundary.  Candidate Acts become independent receipts and
    projection requests become disposable projection documents.  The closure receipt
    records their hashes, so every movement has a ledger/provenance edge.
    """
    materialized = dict(adapter_aux)

    candidate_acts = materialized.get("candidate_acts", []) or []
    if not isinstance(candidate_acts, list):
        raise AdapterError("adapter-output-invalid: candidate_acts must be a list")
    candidate_hashes: list[str] = []
    for candidate in candidate_acts:
        if not isinstance(candidate, dict):
            raise AdapterError("adapter-output-invalid: candidate Act must be an object")
        candidate_hashes.append(append(db, candidate)["id"])
    if candidate_hashes:
        materialized["candidate_hashes"] = candidate_hashes

    projection_requests = materialized.pop("projection_requests", []) or []
    if not isinstance(projection_requests, list):
        raise AdapterError("adapter-output-invalid: projection_requests must be a list")
    projection_hashes: list[str] = []
    if projection_requests:
        # Local import avoids a module cycle: projections uses runtime.now().
        from .projections import compute_projection, store_projection

        for request in projection_requests:
            if not isinstance(request, dict):
                raise AdapterError("adapter-output-invalid: projection request must be an object")
            doc = compute_projection(
                db,
                str(request.get("projection_spec", "lab_current_state")),
                projection_class=str(request.get("projection_class", "stable")),
                pin=request.get("pin"),
                parent_projection_hashes=request.get("parent_projection_hashes", ()),
                ladder_level=str(request.get("ladder_level", "L0")),
            )
            stored = store_projection(db, doc)
            projection_hashes.append(stored["projection_hash"])
    if projection_hashes:
        materialized["projection_hashes"] = projection_hashes

    return materialized


def close_evidence_incomplete(
    db: sqlite3.Connection,
    item: dict[str, Any],
    decision: dict[str, Any],
    worker: str,
    adapter_aux: dict[str, Any],
    gaps: list[str],
) -> dict[str, Any]:
    """The adapter ran but did not prove the declared evidence — do NOT fake closure.

    A completion receipt existing is not evidence that the obligation was met. When the
    declared ``evidence_must_include`` fields are absent we write a durable ``doubted``
    receipt (did ``evidence_incomplete``) instead of ``fechado``, preserving what the
    adapter did produce for triage. This is "do not close over a ghost" in the runtime.
    """
    fields: dict[str, Any] = {
        "who": "runtime.executor",
        "did": "evidence_incomplete",
        "this": item["source_hash"],
        "when": now(),
        "confirmed_by": worker,
        "if_ok": "attention-raise.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "executor.failed",
        "status": "doubted",
        "process_id": item["process_id"],
        "queue_id": item["queue_id"],
        "adapter": item["adapter"],
        "reason": "evidence_obligation_unmet",
        "evidence_must_include": list(decision.get("evidence_must_include", ())),
        "missing_evidence": gaps,
    }
    for key, value in adapter_aux.items():
        fields.setdefault(key, value)  # keep attempted evidence; never overwrite the doubt framing
    result = append(db, fields)
    return close(db, item["queue_id"], result["id"])


def dangerous_control_decision(
    db: sqlite3.Connection, source: dict[str, Any], item: dict[str, Any], decision: dict[str, Any]
) -> dict[str, Any] | None:
    """Gate L4/L5 work on a resolved, verified grant — not on self-asserted fields.

    The requesting Act may name a ``grant_id``; authority, budget, window, and sandbox
    scope are read from the registered grant it resolves to (LAB FINAL SPEC §13), so a
    caller can no longer vouch for itself. Any failure becomes a durable ``doubted``
    close upstream; nothing dangerous is silently dropped, escalated, or retried.
    """
    if decision.get("danger_tier") not in DANGEROUS_TIERS:
        return None
    adapter = decision.get("adapter") or item.get("adapter")
    required_acu = ADAPTER_ACU_COST.get(adapter, 1)
    grant_id = source.get("grant_id")
    if not grant_id:
        reason = "missing_required_grant"
    else:
        grant = resolve_grant(db, grant_id)
        if grant is None:
            reason = "grant_not_found"
        else:
            ok, reason = verify_grant(
                db,
                grant,
                source=source,
                process_id=item["process_id"],
                effective_adapter=adapter,
                required_acu=required_acu,
                allowed_who=tuple(decision.get("allowed_who", ())),
            )
            if ok:
                # All L4/L5 work additionally requires a verified passkey signoff on the
                # grant (fail-closed). Structural authority (the registry) is not enough;
                # a hardware+biometric-gated human must have signed this grant.
                signed_ok, signed_reason = require_grant_signoff(db, grant)
                if signed_ok:
                    return None
                reason = signed_reason
    blocked = dict(decision)
    blocked.update(
        {
            "activate": False,
            "queueable": False,
            "activation_state": "doubted",
            "reason": reason,
            "budget_required": required_acu,
            "grant_id": grant_id,
        }
    )
    return blocked


def executor_run_once(db: sqlite3.Connection, worker: str = "executor") -> dict[str, Any] | None:
    ensure_runtime(db)
    state = service_state(db, "executor")
    if state["paused"]:
        raise Conflict(f"executor is paused: {state.get('reason') or 'no reason'}")
    item = claim(db, worker)
    if item is None:
        return None
    try:
        source = require(db, item["source_hash"])
        decision = evaluate(source, item["process_id"])
        if not decision.get("activate"):
            return close_without_dispatch(db, item, decision, worker)
        dangerous_decision = dangerous_control_decision(db, source, item, decision)
        if dangerous_decision is not None:
            return close_without_dispatch(db, item, dangerous_decision, worker)
        if item["adapter"] != decision.get("adapter"):
            # The queue is a projection of the evaluator's decision, never a place to
            # reinterpret the contract. If the queued adapter disagrees with the one the
            # contract resolves now, the row is corrupt — refuse rather than dispatch.
            mismatch = dict(decision)
            mismatch.update({
                "activate": False,
                "queueable": False,
                "activation_state": "doubted",
                "reason": "dispatch_mismatch",
                "queued_adapter": item["adapter"],
                "expected_adapter": decision.get("adapter"),
            })
            return close_without_dispatch(db, item, mismatch, worker)
        if decision.get("adapter") not in REGISTRY:
            # The contract resolves an adapter with no registered implementation. Grant
            # and signoff checks (above) have already passed for dangerous work, so this
            # is purely "no real adapter" — fail closed with a durable doubt instead of
            # reaching run_adapter and raising.
            return close_without_dispatch(db, item, _unregistered_adapter_block(decision), worker)
        append(
            db,
            {
                "who": "runtime.executor",
                "did": "dispatching",
                "this": item["source_hash"],
                "when": now(),
                "confirmed_by": worker,
                "if_ok": item["adapter"],
                "if_doubt": "attention-raise.v1",
                "if_not": "executor.failed",
                "status": "processando",
                "process_id": item["process_id"],
                "queue_id": item["queue_id"],
                "adapter": item["adapter"],
            },
        )
        adapter_aux = run_adapter(item["adapter"], source, item)
        adapter_aux = materialize_adapter_outputs(db, adapter_aux)
        gaps = missing_evidence(decision.get("evidence_must_include", ()), adapter_aux)
        if gaps:
            return close_evidence_incomplete(db, item, decision, worker, adapter_aux, gaps)
        did = "llm.receipt" if item["adapter"] == "inference" else "fechado"
        result = append(
            db,
            {
                "who": "runtime.executor",
                "did": did,
                "this": item["source_hash"],
                "when": now(),
                "confirmed_by": worker,
                "if_ok": "evidence-closure.v1",
                "if_doubt": "attention-raise.v1",
                "if_not": "executor.failed",
                "status": "fechado",
                "process_id": item["process_id"],
                "queue_id": item["queue_id"],
                "adapter": item["adapter"],
                **adapter_aux,
            },
        )
        return close(db, item["queue_id"], result["id"])
    except AdapterError as exc:
        # A model/schema/adapter refusal is a governed doubt, not a vanished queue row or
        # an implicit if_not transition.  The attempted dispatch remains visible.
        result = append(
            db,
            {
                "who": "runtime.executor",
                "did": "adapter_doubted",
                "this": item["source_hash"],
                "when": now(),
                "confirmed_by": worker,
                "if_ok": "attention-raise.v1",
                "if_doubt": "attention-raise.v1",
                "if_not": "executor.failed",
                "status": "doubted",
                "process_id": item["process_id"],
                "queue_id": item["queue_id"],
                "adapter": item["adapter"],
                "reason": "adapter_rejected",
                "adapter_error": str(exc),
            },
        )
        return close(db, item["queue_id"], result["id"])
    except Exception as exc:
        fail(db, item["queue_id"], str(exc))
        raise
