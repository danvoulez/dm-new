"""Operator-controlled model registry and subprocess inference boundary.

The ledger may *name* a model, but it may never smuggle an executable command into
runtime authority.  Commands live in a local operator registry outside the receipt.
The inference adapter resolves the named model here, invokes it without a shell, and
returns its JSON output to the governed executor path.
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any, Mapping, Sequence

from .errors import AdapterError

DEFAULT_REGISTRY = ".lab/models.json"


def registry_path() -> Path:
    return Path(os.environ.get("LAB_MODEL_REGISTRY", DEFAULT_REGISTRY)).expanduser()


def load_registry(path: str | Path | None = None) -> dict[str, dict[str, Any]]:
    target = Path(path) if path is not None else registry_path()
    if not target.exists():
        return {}
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AdapterError(f"model-registry-invalid: {exc}") from exc
    models = payload.get("models", payload) if isinstance(payload, Mapping) else None
    if not isinstance(models, Mapping):
        raise AdapterError("model-registry-invalid: root must be an object or contain a models object")
    result: dict[str, dict[str, Any]] = {}
    for model_id, config in models.items():
        if isinstance(model_id, str) and isinstance(config, Mapping):
            result[model_id] = dict(config)
    return result


def save_registry(models: Mapping[str, Mapping[str, Any]], path: str | Path | None = None) -> Path:
    target = Path(path) if path is not None else registry_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "models": {key: dict(models[key]) for key in sorted(models)}}
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def _normalize_command(command: Sequence[str] | str) -> list[str]:
    if isinstance(command, str):
        # Registry files are operator-controlled, not receipt-controlled.  shlex is used
        # only to parse an operator configuration string; subprocess still runs shell=False.
        parts = shlex.split(command)
    elif isinstance(command, Sequence):
        parts = [str(part) for part in command]
    else:
        parts = []
    if not parts or any(not part for part in parts):
        raise AdapterError("model-registry-invalid: command must contain at least one non-empty argument")
    return parts


def register_model(
    model_id: str,
    command: Sequence[str] | str,
    *,
    external: bool = False,
    timeout_seconds: int = 60,
    path: str | Path | None = None,
) -> dict[str, Any]:
    if not model_id or any(ch.isspace() for ch in model_id):
        raise AdapterError("model-registry-invalid: model_id must be a non-empty token")
    if timeout_seconds < 1 or timeout_seconds > 3600:
        raise AdapterError("model-registry-invalid: timeout_seconds must be between 1 and 3600")
    models = load_registry(path)
    models[model_id] = {
        "transport": "command",
        "command": _normalize_command(command),
        "external": bool(external),
        "timeout_seconds": int(timeout_seconds),
    }
    target = save_registry(models, path)
    return {"model_id": model_id, "registered": True, "registry": str(target), **models[model_id]}


def list_models(path: str | Path | None = None) -> dict[str, Any]:
    models = load_registry(path)
    return {"registry": str(Path(path) if path is not None else registry_path()), "models": models}


def invoke_registered_model(
    model_id: str,
    request: Mapping[str, Any],
    *,
    allow_external: bool,
    path: str | Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    models = load_registry(path)
    config = models.get(model_id)
    if config is None:
        raise AdapterError(f"model-not-registered: {model_id}")
    if config.get("transport") != "command":
        raise AdapterError(f"model-registry-invalid: unsupported transport for {model_id}")
    external = bool(config.get("external", False))
    if external and not allow_external:
        raise AdapterError(f"external-model-not-allowed: {model_id}")
    command = _normalize_command(config.get("command", []))
    timeout = int(config.get("timeout_seconds", 60))
    try:
        proc = subprocess.run(
            command,
            input=json.dumps(dict(request), ensure_ascii=False),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            shell=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise AdapterError(f"model-call-failed: {exc}") from exc
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()[:1000]
        raise AdapterError(f"model-call-failed: exit={proc.returncode} {detail}")
    try:
        output = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AdapterError(f"schema-invalid: model output is not JSON: {exc}") from exc
    if not isinstance(output, Mapping):
        raise AdapterError("schema-invalid: model output must be a JSON object")
    execution = {
        "transport": "command",
        "external": external,
        "returncode": proc.returncode,
        "stderr_present": bool(proc.stderr.strip()),
    }
    return dict(output), execution


def unregister_model(model_id: str, path: str | Path | None = None) -> dict[str, Any]:
    models = load_registry(path)
    existed = model_id in models
    models.pop(model_id, None)
    target = save_registry(models, path)
    return {"model_id": model_id, "removed": existed, "registry": str(target)}
