"""Governed LLM inference boundary.

An inference request is registered as candidate memory first.  The executor later
selects the ``inference`` adapter.  Dry-run remains available for conformance and
replay, while any real model command must be resolved from the operator-controlled
model registry in :mod:`lab.model_runtime`; a receipt can name a model but cannot
smuggle an executable command into authority.
"""
from __future__ import annotations

import json
import os
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .dream import validate_schema
from .errors import AdapterError
from .model_runtime import invoke_registered_model
from .receipt import canonical_json, sha256_text
from .resources import resource_path
from .store import append

SCHEMA_ROOT_DEFAULT = "schemas/llm"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_inference_request(
    db,
    task: str,
    *,
    model_id: str,
    schema_id: str,
    prompt_id: str | None = None,
    prompt_text: str | None = None,
    input_value: Any = None,
    input_hashes: Sequence[str] = (),
    projection_hashes: Sequence[str] = (),
    params: Mapping[str, Any] | None = None,
    mock_output: Mapping[str, Any] | str | None = None,
    allow_external_model: bool = False,
    real_model: bool = False,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "who": "lab.cli",
        "did": "requested_inference",
        "this": task,
        "when": now(),
        "confirmed_by": "lab.cli",
        "if_ok": "inference.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "no_model",
        "status": "candidate",
        "task": task,
        "model_id": model_id,
        "prompt_id": prompt_id or f"{task}.v1",
        "schema_id": schema_id,
        "input_hashes": list(input_hashes),
        "projection_hashes": list(projection_hashes),
        "params": dict(params or {"temperature": 0}),
        "model_called": False,
        "allow_external_model": bool(allow_external_model),
        "inference_mode": "real" if real_model else "dry-run",
    }
    if prompt_text is not None:
        fields["prompt_text"] = prompt_text
    if input_value is not None:
        fields["input"] = input_value
    if mock_output is not None:
        fields["mock_output"] = mock_output
    return append(db, fields)


def _default_output(source: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "summary": f"candidate output for {source.get('task') or source.get('this', '')}",
        "citations": list(source.get("input_hashes", [])) + list(source.get("projection_hashes", [])),
        "requested_action": "register_candidate",
    }


def _schema_root() -> Path:
    configured = os.environ.get("LAB_SCHEMA_ROOT")
    if configured:
        return Path(configured)
    return resource_path(SCHEMA_ROOT_DEFAULT)


def load_output_schema(schema_id: str) -> dict[str, Any]:
    if not schema_id or "/" in schema_id or "\\" in schema_id or schema_id.startswith("."):
        raise AdapterError(f"schema-invalid: invalid schema id {schema_id!r}")
    path = _schema_root() / f"{schema_id}.json"
    if not path.is_file():
        raise AdapterError(f"schema-not-registered: {schema_id}")
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AdapterError(f"schema-invalid: {schema_id}: {exc}") from exc
    if not isinstance(schema, dict):
        raise AdapterError(f"schema-invalid: {schema_id}: schema root must be an object")
    return schema


def _validate_output(output: Any, schema_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(output, Mapping):
        raise AdapterError("schema-invalid: inference output must be an object")
    schema = load_output_schema(schema_id)
    errors = validate_schema(dict(output), schema, schema)
    if errors:
        raise AdapterError(f"schema-invalid: {'; '.join(errors)}")
    return dict(output), schema


def _citations_valid(source: Mapping[str, Any], output: Mapping[str, Any]) -> bool:
    allowed = {
        value
        for value in list(source.get("input_hashes", [])) + list(source.get("projection_hashes", []))
        if isinstance(value, str) and value
    }
    citations = output.get("citations", [])
    if not isinstance(citations, list) or any(not isinstance(value, str) for value in citations):
        return False
    if any(value not in allowed for value in citations):
        return False
    # When the model was given citable context, a substantive answer must cite it.
    if allowed and not citations:
        return False
    return True


def _model_request(source: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "task": source.get("task") or source.get("this", ""),
        "model_id": source.get("model_id", ""),
        "prompt_id": source.get("prompt_id", ""),
        "prompt_text": source.get("prompt_text"),
        "schema_id": source.get("schema_id", ""),
        "input": source.get("input"),
        "input_hashes": list(source.get("input_hashes", [])),
        "projection_hashes": list(source.get("projection_hashes", [])),
        "params": dict(source.get("params", {})),
    }


def run_inference_adapter(source: Mapping[str, Any], queue_item: Mapping[str, Any]) -> dict[str, Any]:
    model_id = str(source.get("model_id", ""))
    dry_run = source.get("inference_mode", "dry-run") != "real"
    execution: dict[str, Any]
    if dry_run:
        raw_output = source.get("mock_output", _default_output(source))
        execution = {"transport": "dry-run", "external": False, "returncode": None, "stderr_present": False}
    else:
        raw_output, execution = invoke_registered_model(
            model_id,
            _model_request(source),
            allow_external=bool(source.get("allow_external_model", False)),
        )
    output, schema = _validate_output(raw_output, str(source.get("schema_id", "")))
    citations_valid = _citations_valid(source, output)
    if not citations_valid:
        raise AdapterError("citations-invalid: model output cites unknown context or omits required citations")

    output_hash = sha256_text(canonical_json(output))
    prompt_material = {
        "prompt_id": source.get("prompt_id", ""),
        "prompt_text": source.get("prompt_text"),
    }
    prompt_hash = sha256_text(canonical_json(prompt_material))
    schema_hash = sha256_text(canonical_json(schema))
    candidate = {
        "who": "inference.adapter",
        "did": "candidate.inference_output",
        "this": source.get("id", queue_item.get("source_hash", "")),
        "when": now(),
        "confirmed_by": "inference.adapter",
        "if_ok": "attention-raise.v1",
        "if_doubt": "attention-raise.v1",
        "if_not": "discard_candidate",
        "status": "candidate",
        "output_hash": output_hash,
        "schema_id": source.get("schema_id", ""),
        "model_id": model_id,
        "candidate_payload": output,
        "activates_process": False,
    }
    return {
        "adapter_class": "inference.dry_run" if dry_run else "inference.command",
        "external_effect": False,
        "model_boundary_external": bool(execution.get("external", False)),
        "model_called": not dry_run,
        "model_id": model_id,
        "model_execution": execution,
        "prompt_hash": prompt_hash,
        "schema_hash": schema_hash,
        "schema_id": source.get("schema_id", ""),
        "input_hashes": list(source.get("input_hashes", [])),
        "projection_hashes": list(source.get("projection_hashes", [])),
        "output_hash": output_hash,
        "schema_valid": True,
        "citations_valid": True,
        "candidate_acts": [candidate],
    }
