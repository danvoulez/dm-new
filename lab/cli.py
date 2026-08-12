"""Command-line interface for the fresh Lab runtime."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from .authority import (
    authority_recognized,
    enroll_authenticator,
    get_authenticator,
    register_authority,
    register_genesis_authority,
    revoke_authority,
)
from .bootstrap import DEFAULT_BENCH_DB, bench_status, bootstrap_local, genesis_local, reset_bench
from .grants import (
    grant_detail,
    list_grants,
    record_grant_signoff,
    register_grant,
    require_grant_signoff,
    resolve_grant,
    revoke_grant,
)
from .dream import DREAM_ROOT_DEFAULT, ingest_corpus, load_schemas, propose_question, register_candidate, verify_dream_machine
from .errors import LabError
from .evaluator import evaluate
from .fleet import audit_fleet
from .foundation import FOUNDATION_ROOT_DEFAULT, verify_foundation_suite, verify_receipt_file
from .inference import build_inference_request
from .model_runtime import list_models, register_model, unregister_model
from .inspect import inspect_hash
from .process_catalog import write_generated_process_files
from .receipt import mint, verify
from .harness import VECTORS_DEFAULT, run_harness
from .projections import project_all, project_build, project_descend, project_inspect, project_verify
from .runtime import (
    claim,
    close,
    executor_run_once,
    clock_now,
    clock_select_due,
    inspect_queue,
    queue_add,
    queue_rebuild_due,
    queue_list,
    receiver_select,
    release,
    service_state,
    set_service_paused,
)
from .store import append, connect, count, get, list_acts, require

DB = os.environ.get("LAB_DB", ".lab/lab.sqlite")


def emit_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_json_object(text: str | None) -> dict[str, Any]:
    if not text:
        return {}
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("--data must be a JSON object")
    return value


def fields(args: argparse.Namespace) -> dict[str, Any]:
    data = parse_json_object(getattr(args, "data", None))
    for key in ["who", "did", "this", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"]:
        if hasattr(args, key) and getattr(args, key) is not None:
            data[key] = getattr(args, key)
    data.setdefault("when", utc_now())
    return data


def add_act_args(parser: argparse.ArgumentParser) -> None:
    for name in ["who", "did", "this", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"]:
        parser.add_argument(f"--{name}", default="")
    parser.add_argument("--data", help="AUX JSON object merged into the receipt before hashing")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lab")
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name in ("act", "register"):
        add_act_args(sub.add_parser(name))

    send = sub.add_parser("send")
    send.add_argument("did")
    send.add_argument("this")
    send.add_argument("--to", required=True)
    send.add_argument("--data")
    send.add_argument("--who", default="lab.cli")

    schedule = sub.add_parser("schedule")
    schedule.add_argument("did")
    schedule.add_argument("this")
    schedule.add_argument("--at", required=True)
    schedule.add_argument("--process", required=True)
    schedule.add_argument("--adapter", default="receipt")
    schedule.add_argument("--data")
    schedule.add_argument("--who", default="lab.cli")

    sub.add_parser("status")
    sub.add_parser("doctor")

    bootstrap = sub.add_parser("bootstrap")
    bsub = bootstrap.add_subparsers(dest="bootstrap_cmd", required=True)
    for name in ("local", "reset-bench", "status"):
        bsub.add_parser(name).add_argument("--db", default=DEFAULT_BENCH_DB)
    bgen = bsub.add_parser("genesis")
    bgen.add_argument("--db", default=DEFAULT_BENCH_DB)
    bgen.add_argument("--identity", default=None)
    harness = sub.add_parser("harness")
    harness.add_argument("--source", default=VECTORS_DEFAULT)

    dream = sub.add_parser("dream")
    dream_sub = dream.add_subparsers(dest="dream_cmd", required=True)
    dream_verify = dream_sub.add_parser("verify")
    dream_verify.add_argument("--source", default=DREAM_ROOT_DEFAULT)
    dream_ingest = dream_sub.add_parser("ingest")
    dream_ingest.add_argument("corpus")
    dream_propose = dream_sub.add_parser("propose")
    dream_propose.add_argument("question")
    dream_candidate = dream_sub.add_parser("register-candidate")
    dream_candidate.add_argument("json_file")
    dream_candidate.add_argument("--schema", required=True)
    dream_candidate.add_argument("--source", default=DREAM_ROOT_DEFAULT)
    cite_parser = sub.add_parser("cite")
    cite_parser.add_argument("hash")
    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("hash")
    h = sub.add_parser("hash")
    h.add_argument("json_file")
    read = sub.add_parser("read")
    read.add_argument("--limit", type=int, default=20)
    read.add_argument("--if-ok")
    read.add_argument("--status")

    ev = sub.add_parser("evaluate")
    ev.add_argument("hash")
    ev.add_argument("--process")

    mine = sub.add_parser("mine")
    mine.add_argument("frequency")
    mine.add_argument("limit", type=int, nargs="?", default=20)

    wake_spec = sub.add_parser("wake-spec")
    wake_spec.add_argument("frequency")
    wake_spec.add_argument("--limit", type=int, default=20)

    wake_handled = sub.add_parser("wake-handled")
    wake_handled.add_argument("source_hash")
    wake_handled.add_argument("--who", default="runtime.receiver")

    wake_receipt = sub.add_parser("wake-receipt")
    wake_receipt.add_argument("source_hash")
    wake_receipt.add_argument("--did", default="wake_receipt")
    wake_receipt.add_argument("--status", default="registered")
    wake_receipt.add_argument("--if-ok", dest="if_ok", default="memory-register.v1")
    wake_receipt.add_argument("--if-doubt", dest="if_doubt", default="attention-raise.v1")
    wake_receipt.add_argument("--if-not", dest="if_not", default="wake.skip")
    wake_receipt.add_argument("--who", default="runtime.receiver")
    wake_receipt.add_argument("--data")

    queue = sub.add_parser("queue")
    qsub = queue.add_subparsers(dest="queue_cmd", required=True)
    qa = qsub.add_parser("add")
    qa.add_argument("hash")
    qa.add_argument("--process", default="memory-register.v1")
    qa.add_argument("--adapter", default="receipt")
    ql = qsub.add_parser("list")
    ql.add_argument("--status", default="queued")
    ql.add_argument("--limit", type=int, default=20)
    qi = qsub.add_parser("inspect")
    qi.add_argument("queue_id")
    qc = qsub.add_parser("claim")
    qc.add_argument("--worker", default="executor")
    qr = qsub.add_parser("release")
    qr.add_argument("queue_id")
    qr.add_argument("--reason", default="released")
    qx = qsub.add_parser("close")
    qx.add_argument("queue_id")
    qx.add_argument("--result-hash", required=True)
    qb = qsub.add_parser("rebuild")
    qb.add_argument("--now-at")
    qb.add_argument("--from", dest="from_time")
    qb.add_argument("--to", dest="to_time")
    qb.add_argument("--limit", type=int, default=100)

    receiver = sub.add_parser("receiver")
    receiver.add_argument("frequency")
    receiver.add_argument("--limit", type=int, default=20)

    executor = sub.add_parser("executor")
    executor.add_argument("mode", choices=["run", "daemon", "pause", "resume", "status"])
    executor.add_argument("--worker", default="executor")
    executor.add_argument("--reason", default="")

    clock = sub.add_parser("clock")
    clock.add_argument("mode", choices=["tick", "daemon", "backfill", "now"])
    clock.add_argument("--now-at")
    clock.add_argument("--from", dest="from_time")
    clock.add_argument("--to", dest="to_time")
    clock.add_argument("--limit", type=int, default=100)

    project = sub.add_parser("project")
    project.add_argument("mode", choices=["all", "build", "inspect", "descend", "verify"])
    project.add_argument("target", nargs="?")
    project.add_argument("--class", dest="projection_class", choices=["stable", "dynamic"], default="stable")
    project.add_argument("--pin", help="JSON pin for dynamic projections")
    project.add_argument("--parent", action="append", default=[])
    project.add_argument("--ladder-level", default="L0")

    infer = sub.add_parser("infer")
    infer.add_argument("task")
    infer.add_argument("--model", required=True)
    infer.add_argument("--schema", required=True)
    infer.add_argument("--prompt-id")
    infer.add_argument("--prompt-text")
    infer.add_argument("--input-json")
    infer.add_argument("--input-hash", action="append", default=[])
    infer.add_argument("--projection-hash", action="append", default=[])
    infer.add_argument("--allow-external-model", action="store_true")
    infer.add_argument("--real-model", action="store_true", help="invoke the operator-registered model command")

    model = sub.add_parser("model")
    model_sub = model.add_subparsers(dest="model_cmd", required=True)
    model_register = model_sub.add_parser("register")
    model_register.add_argument("model_id")
    model_register.add_argument("--command-json", required=True, help="JSON array argv; executed without a shell")
    model_register.add_argument("--external", action="store_true")
    model_register.add_argument("--timeout", type=int, default=60)
    model_sub.add_parser("list")
    model_remove = model_sub.add_parser("remove")
    model_remove.add_argument("model_id")

    process = sub.add_parser("process")
    process_sub = process.add_subparsers(dest="process_cmd", required=True)
    process_generate = process_sub.add_parser("generate")
    process_generate.add_argument("--root", default="processes")
    process_generate.add_argument("--out")

    fleet = sub.add_parser("fleet")
    fleet_sub = fleet.add_subparsers(dest="fleet_cmd", required=True)
    fleet_audit = fleet_sub.add_parser("audit")
    fleet_audit.add_argument("--root", default="fleet")

    # Authority and grants had no surface outside the Python API, so the whole
    # dangerous-work path (L4/L5) was unreachable from the shipped CLI — and from
    # anything a UI could call. These expose it without widening it.
    authority = sub.add_parser("authority", help="registered signers: the root of trust")
    authority_sub = authority.add_subparsers(dest="authority_cmd", required=True)
    auth_genesis = authority_sub.add_parser("genesis", help="seed the self-attested root authority")
    auth_genesis.add_argument("identity")
    auth_genesis.add_argument("--note", default="")
    auth_register = authority_sub.add_parser("register")
    auth_register.add_argument("identity")
    auth_register.add_argument("--by", required=True, help="registrar; must itself be an authority")
    auth_register.add_argument("--note", default="")
    auth_revoke = authority_sub.add_parser("revoke")
    auth_revoke.add_argument("identity")
    auth_revoke.add_argument("--by", required=True)
    auth_revoke.add_argument("--reason", default="revoked")
    auth_show = authority_sub.add_parser("show")
    auth_show.add_argument("identity")
    auth_enroll = authority_sub.add_parser("enroll-authenticator")
    auth_enroll.add_argument("identity")
    auth_enroll.add_argument("--credential-id", required=True)
    auth_enroll.add_argument("--public-key", required=True)
    auth_enroll.add_argument("--rp-id", required=True)
    auth_enroll.add_argument("--origin", required=True)
    auth_enroll.add_argument("--by", required=True)
    auth_enroll.add_argument("--sign-count", type=int, default=0)
    auth_enroll.add_argument("--aaguid", default="")

    grant = sub.add_parser("grant", help="registered authorizations for dangerous work")
    grant_sub = grant.add_subparsers(dest="grant_cmd", required=True)
    grant_register = grant_sub.add_parser("register")
    grant_register.add_argument("--process", required=True)
    grant_register.add_argument("--granted-by", required=True)
    grant_register.add_argument("--granted-to", required=True)
    grant_register.add_argument("--adapter", default="*")
    grant_register.add_argument("--valid-until", default="", help="RFC3339; a grant with no expiry never verifies")
    grant_register.add_argument("--acu-limit", type=int, default=0)
    grant_register.add_argument("--timeout", type=int, default=0)
    grant_register.add_argument("--fs-scope", default="")
    grant_register.add_argument("--network-policy", default="none")
    grant_show = grant_sub.add_parser("show")
    grant_show.add_argument("grant_id")
    grant_list = grant_sub.add_parser("list")
    grant_list.add_argument("--limit", type=int, default=20)
    grant_revoke = grant_sub.add_parser("revoke")
    grant_revoke.add_argument("grant_id")
    grant_revoke.add_argument("--by", required=True)
    grant_revoke.add_argument("--reason", default="revoked")
    grant_sign = grant_sub.add_parser("signoff", help="record a passkey assertion over the grant hash")
    grant_sign.add_argument("grant_id")
    grant_sign.add_argument("--signer", required=True)
    grant_sign.add_argument("--credential", required=True, help="WebAuthn assertion as JSON")
    grant_verify = grant_sub.add_parser("verify")
    grant_verify.add_argument("grant_id")

    api = sub.add_parser("api", help="HTTP surface for a user interface")
    api_sub = api.add_subparsers(dest="api_cmd", required=True)
    api_serve = api_sub.add_parser("serve")
    api_serve.add_argument("--host", default="127.0.0.1")
    api_serve.add_argument("--port", type=int, default=8787)
    api_serve.add_argument("--read-only", action="store_true", help="refuse every write endpoint")

    foundation = sub.add_parser("foundation")
    foundation_sub = foundation.add_subparsers(dest="foundation_cmd", required=True)
    foundation_suite = foundation_sub.add_parser("suite")
    foundation_suite.add_argument("--source", default=FOUNDATION_ROOT_DEFAULT)
    foundation_receipt = foundation_sub.add_parser("verify-receipt")
    foundation_receipt.add_argument("json_file")
    foundation_receipt.add_argument("--source", default=FOUNDATION_ROOT_DEFAULT)
    return parser


def run(args: argparse.Namespace) -> Any:
    if args.cmd == "bootstrap":
        # Bench operations target the bench DB, never the real ledger — dispatch before
        # the default connect(DB) so they never create or touch .lab/lab.sqlite.
        if args.bootstrap_cmd == "local":
            return bootstrap_local(args.db)
        if args.bootstrap_cmd == "reset-bench":
            return reset_bench(args.db)
        if args.bootstrap_cmd == "genesis":
            return genesis_local(connect(args.db), identity=args.identity)
        if args.bootstrap_cmd == "status":
            return bench_status(connect(args.db), args.db)
    db = connect(DB)
    if args.cmd in {"act", "register"}:
        return append(db, fields(args))
    if args.cmd == "send":
        data = parse_json_object(args.data)
        data.update(
            {
                "who": args.who,
                "did": args.did,
                "this": args.this,
                "confirmed_by": "lab.cli",
                "if_ok": args.to,
                "if_doubt": "attention-raise.v1",
                "if_not": "unroutable",
                "status": "sent",
                "when": utc_now(),
            }
        )
        return append(db, data)
    if args.cmd == "schedule":
        data = parse_json_object(args.data)
        data.update(
            {
                "who": args.who,
                "did": args.did,
                "this": args.this,
                "confirmed_by": "lab.cli",
                "if_ok": args.process,
                "if_doubt": "attention-raise.v1",
                "if_not": "clock.skip",
                "status": "scheduled",
                "when": args.at,
                "process_id": args.process,
                "adapter": args.adapter,
            }
        )
        return append(db, data)
    if args.cmd == "status":
        return {"ledger": "logline_acts", "db": DB, "count": count(db), "executor": service_state(db, "executor")}
    if args.cmd == "doctor":
        return {
            "ok": True,
            "ledger": "logline_acts",
            "db": DB,
            "count": count(db),
            "executor": service_state(db, "executor"),
            "commands": {
                "fresh": ["act", "register", "send", "schedule", "evaluate", "queue", "clock", "executor"],
                "selector": ["mine", "receiver", "wake-spec", "wake-handled", "wake-receipt"],
                "emit": "deprecated",
            },
        }
    if args.cmd == "harness":
        result = run_harness(args.source)
        if not result["ok"]:
            raise LabError("pack vector harness failed")
        return result
    if args.cmd == "dream" and args.dream_cmd == "verify":
        result = verify_dream_machine(args.source)
        if not result["ok"]:
            raise LabError("dream machine verification failed")
        return result
    if args.cmd == "dream" and args.dream_cmd == "ingest":
        return ingest_corpus(db, args.corpus)
    if args.cmd == "dream" and args.dream_cmd == "propose":
        return propose_question(db, args.question)
    if args.cmd == "dream" and args.dream_cmd == "register-candidate":
        with open(args.json_file, encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise LabError("Dream candidate payload must be a JSON object")
        return register_candidate(db, args.schema, payload, schemas=load_schemas(args.source))
    if args.cmd == "cite":
        return require(db, args.hash)
    if args.cmd == "inspect":
        # Read-only portal surface: metadata + slots + validation + safe source refs,
        # with no verb that can advance the ledger.
        return inspect_hash(db, args.hash)
    if args.cmd == "read":
        return list_acts(db, args.limit, if_ok=args.if_ok, status=args.status)
    if args.cmd == "hash":
        with open(args.json_file, encoding="utf-8") as handle:
            value = json.load(handle)
        ok, message = verify(value) if isinstance(value, dict) and "hashes" in value else (True, "minted")
        return mint(value) if message == "minted" else {"ok": ok, "message": message}
    if args.cmd == "evaluate":
        return evaluate(require(db, args.hash), args.process)
    if args.cmd in {"mine", "receiver"}:
        return receiver_select(db, args.frequency, args.limit)
    if args.cmd == "wake-spec":
        addressed = list_acts(db, args.limit, if_ok=args.frequency)
        return {
            "frequency": args.frequency,
            "addressed": len(addressed),
            "hashes": [receipt["id"] for receipt in addressed],
            "effect": "no_direct_execution",
        }
    if args.cmd == "wake-handled":
        require(db, args.source_hash)
        return append(
            db,
            {
                "who": args.who,
                "did": "wake_handled",
                "this": args.source_hash,
                "when": utc_now(),
                "confirmed_by": "lab.cli",
                "if_ok": "evidence-closure.v1",
                "if_doubt": "attention-raise.v1",
                "if_not": "wake.skip",
                "status": "fechado",
            },
        )
    if args.cmd == "wake-receipt":
        require(db, args.source_hash)
        data = parse_json_object(args.data)
        data.update(
            {
                "who": args.who,
                "did": args.did,
                "this": args.source_hash,
                "when": utc_now(),
                "confirmed_by": "lab.cli",
                "if_ok": args.if_ok,
                "if_doubt": args.if_doubt,
                "if_not": args.if_not,
                "status": args.status,
            }
        )
        return append(db, data)
    if args.cmd == "queue":
        if args.queue_cmd == "add":
            return queue_add(db, args.hash, args.process, args.adapter)
        if args.queue_cmd == "list":
            return queue_list(db, args.status, args.limit)
        if args.queue_cmd == "inspect":
            item = inspect_queue(db, args.queue_id)
            if item is None:
                raise LabError(f"queue item not found: {args.queue_id}")
            return item
        if args.queue_cmd == "claim":
            return claim(db, args.worker)
        if args.queue_cmd == "release":
            return release(db, args.queue_id, reason=args.reason)
        if args.queue_cmd == "close":
            return close(db, args.queue_id, args.result_hash)
        if args.queue_cmd == "rebuild":
            return queue_rebuild_due(db, now_at=args.now_at, from_time=args.from_time, to_time=args.to_time, limit=args.limit)
    if args.cmd == "executor":
        if args.mode == "run":
            return executor_run_once(db, args.worker)
        if args.mode == "daemon":
            result = executor_run_once(db, args.worker)
            return {"mode": "daemon", "ran": 1 if result else 0, "result": result}
        if args.mode == "pause":
            return set_service_paused(db, "executor", True, args.reason)
        if args.mode == "resume":
            return set_service_paused(db, "executor", False, args.reason)
        return service_state(db, "executor")
    if args.cmd == "clock":
        if args.mode == "now":
            return clock_now()
        if args.mode in {"tick", "daemon"}:
            return {"selector": "clock", "mode": args.mode, "selected": clock_select_due(db, now_at=args.now_at, limit=args.limit), "effect": "no_direct_execution"}
        return {"selector": "clock", "mode": args.mode, "selected": clock_select_due(db, from_time=args.from_time, to_time=args.to_time, limit=args.limit), "effect": "no_direct_execution"}
    if args.cmd == "project":
        if args.mode == "all":
            return project_all(db)
        if args.mode == "build":
            return project_build(
                db,
                args.target or "lab_current_state",
                projection_class=args.projection_class,
                pin=parse_json_object(args.pin),
                parent_projection_hashes=args.parent,
                ladder_level=args.ladder_level,
            )
        if args.mode == "inspect":
            if not args.target:
                raise LabError("project inspect requires a projection hash")
            return project_inspect(db, args.target)
        if args.mode == "descend":
            if not args.target:
                raise LabError("project descend requires a projection hash")
            return project_descend(db, args.target)
        return project_verify(db)
    if args.cmd == "infer":
        input_value = json.loads(args.input_json) if args.input_json is not None else None
        return build_inference_request(
            db,
            args.task,
            model_id=args.model,
            schema_id=args.schema,
            prompt_id=args.prompt_id,
            prompt_text=args.prompt_text,
            input_value=input_value,
            input_hashes=args.input_hash,
            projection_hashes=args.projection_hash,
            allow_external_model=args.allow_external_model,
            real_model=args.real_model,
        )
    if args.cmd == "model":
        if args.model_cmd == "list":
            return list_models()
        if args.model_cmd == "remove":
            return unregister_model(args.model_id)
        command = json.loads(args.command_json)
        if not isinstance(command, list) or not all(isinstance(part, str) for part in command):
            raise LabError("--command-json must be a JSON array of strings")
        return register_model(
            args.model_id,
            command,
            external=args.external,
            timeout_seconds=args.timeout,
        )
    if args.cmd == "authority":
        if args.authority_cmd == "genesis":
            return register_genesis_authority(db, args.identity, note=args.note)
        if args.authority_cmd == "register":
            return register_authority(db, args.identity, registered_by=args.by, note=args.note)
        if args.authority_cmd == "revoke":
            return revoke_authority(db, args.identity, revoked_by=args.by, reason=args.reason)
        if args.authority_cmd == "show":
            recognized, reason = authority_recognized(db, args.identity)
            return {
                "identity": args.identity,
                "recognized": recognized,
                "reason": reason,
                "authenticator": get_authenticator(db, args.identity),
            }
        if args.authority_cmd == "enroll-authenticator":
            return enroll_authenticator(
                db,
                args.identity,
                credential_id=args.credential_id,
                public_key=args.public_key,
                rp_id=args.rp_id,
                origin=args.origin,
                registered_by=args.by,
                sign_count=args.sign_count,
                aaguid=args.aaguid,
            )
    if args.cmd == "grant":
        if args.grant_cmd == "register":
            return register_grant(
                db,
                process=args.process,
                granted_by=args.granted_by,
                granted_to=args.granted_to,
                adapter=args.adapter,
                valid_until=args.valid_until,
                acu_limit=args.acu_limit,
                timeout_seconds=args.timeout,
                fs_scope=args.fs_scope,
                network_policy=args.network_policy,
            )
        if args.grant_cmd == "show":
            return grant_detail(db, args.grant_id)
        if args.grant_cmd == "list":
            return {"grants": list_grants(db, limit=args.limit)}
        if args.grant_cmd == "revoke":
            return revoke_grant(db, args.grant_id, revoked_by=args.by, reason=args.reason)
        if args.grant_cmd == "signoff":
            return record_grant_signoff(db, args.grant_id, signer=args.signer, credential=args.credential)
        if args.grant_cmd == "verify":
            grant = resolve_grant(db, args.grant_id)
            if grant is None:
                raise LabError(f"grant not found: {args.grant_id}")
            signed, reason = require_grant_signoff(db, grant)
            return {"grant_id": args.grant_id, "signed_off": signed, "reason": reason}
    if args.cmd == "api" and args.api_cmd == "serve":
        from .api import serve

        return serve(host=args.host, port=args.port, read_only=args.read_only)
    if args.cmd == "process" and args.process_cmd == "generate":
        return write_generated_process_files(args.root, args.out)
    if args.cmd == "fleet" and args.fleet_cmd == "audit":
        return audit_fleet(args.root)
    if args.cmd == "foundation" and args.foundation_cmd == "suite":
        return verify_foundation_suite(args.source)
    if args.cmd == "foundation" and args.foundation_cmd == "verify-receipt":
        return verify_receipt_file(args.json_file, args.source)
    raise LabError(f"unhandled command: {args.cmd}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        emit_json(run(parser.parse_args(argv)))
    except (LabError, ValueError, json.JSONDecodeError, OSError) as exc:
        emit_json({"ok": False, "error": str(exc)})
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
