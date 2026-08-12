"""Dream Machine source-pack conformance checks.

Dream Machine is more than a source audit: its own pack ships schemas, examples,
acceptance tests, and invariants.  This module executes a stdlib-only conformance
pass over that pack so the Lab can prove the material boundary locally: claims
need evidence, maps cannot become truth by display, answers must expose unknowns,
and fixture examples validate/reject as declared.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import LabError
from .receipt import canonical_json, sha256_text
from .resources import resource_path
from .store import append

DREAM_ROOT_DEFAULT = "tests/fixtures/dream-machine"
EXAMPLE_DIR = "examples"
# Paths below are relative to the Dream Machine pack root.
REQUIRED_DREAM_FILES = {
    "readme": "README.md",
    "implementation_spec": "DREAM_MACHINE_IMPLEMENTATION_SPEC.md",
    "invariants": "INVARIANTS.md",
    "acceptance_tests": "ACCEPTANCE_TESTS.md",
    "ids": "IDS.md",
    "cli_contract": "CLI.md",
    "task_graph": "TASK_GRAPH.md",
    "risk_register": "RISKS_AND_MITIGATIONS.md",
}
SCHEMA_FILES = {
    "claim": "schemas/claim.schema.json",
    "source_manifest": "schemas/source_manifest.schema.json",
    "canonical_map": "schemas/canonical_map.schema.json",
    "dream_answer": "schemas/dream_answer.schema.json",
}
REF_PATTERN = re.compile(r"^(source|artifact|extraction|chunk|claim|map|act):")


@dataclass(frozen=True)
class ExampleCase:
    path: str
    schema_name: str
    expect_valid: bool
    payload: dict[str, Any]


def _schema_name_for_example(path: str) -> str | None:
    filename = Path(path).name
    for schema_name in SCHEMA_FILES:
        if filename.startswith(schema_name + ".") or filename == f"{schema_name}.json":
            return schema_name
    if filename == "example_dream_answer.json":
        return "dream_answer"
    return None


def _example_expectation(path: str) -> bool | None:
    if "/valid/" in path or path.endswith("/example_dream_answer.json"):
        return True
    if "/invalid/" in path:
        return False
    return None


def load_schemas(root: str | Path = DREAM_ROOT_DEFAULT) -> dict[str, dict[str, Any]]:
    root = resource_path(str(root)) if str(root) == DREAM_ROOT_DEFAULT else Path(root)
    return {name: json.loads((root / rel).read_text(encoding="utf-8")) for name, rel in SCHEMA_FILES.items()}


def load_examples(root: str | Path = DREAM_ROOT_DEFAULT) -> list[ExampleCase]:
    cases: list[ExampleCase] = []
    base = resource_path(str(root)) if str(root) == DREAM_ROOT_DEFAULT else Path(root)
    for path in sorted((base / EXAMPLE_DIR).rglob("*.json")):
        name = str(path)
        schema_name = _schema_name_for_example(name)
        expect_valid = _example_expectation(name)
        if schema_name is None or expect_valid is None:
            continue
        cases.append(ExampleCase(name, schema_name, expect_valid, json.loads(path.read_text(encoding="utf-8"))))
    return cases


def _type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    return True


def _resolve_ref(schema: dict[str, Any], ref: str) -> dict[str, Any]:
    if ref == "#/$defs/ref":
        return schema.get("$defs", {}).get("ref", {})
    return {}


def validate_schema(value: Any, subschema: dict[str, Any], root_schema: dict[str, Any], path: str = "$") -> list[str]:
    errors: list[str] = []
    if "$ref" in subschema:
        return validate_schema(value, _resolve_ref(root_schema, subschema["$ref"]), root_schema, path)
    expected_type = subschema.get("type")
    if expected_type and not _type_ok(value, expected_type):
        return [f"{path}: expected {expected_type}"]
    if "enum" in subschema and value not in subschema["enum"]:
        errors.append(f"{path}: value {value!r} not in enum")
    if "pattern" in subschema and isinstance(value, str) and not re.search(subschema["pattern"], value):
        errors.append(f"{path}: does not match pattern {subschema['pattern']}")
    if isinstance(value, str):
        if "minLength" in subschema and len(value) < subschema["minLength"]:
            errors.append(f"{path}: shorter than minLength {subschema['minLength']}")
        if "maxLength" in subschema and len(value) > subschema["maxLength"]:
            errors.append(f"{path}: longer than maxLength {subschema['maxLength']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in subschema and value < subschema["minimum"]:
            errors.append(f"{path}: below minimum {subschema['minimum']}")
        if "maximum" in subschema and value > subschema["maximum"]:
            errors.append(f"{path}: above maximum {subschema['maximum']}")
    if isinstance(value, list):
        if "minItems" in subschema and len(value) < subschema["minItems"]:
            errors.append(f"{path}: fewer than {subschema['minItems']} items")
        item_schema = subschema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                errors.extend(validate_schema(item, item_schema, root_schema, f"{path}[{index}]"))
    if isinstance(value, dict):
        required = subschema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(f"{path}: missing required {key}")
        properties = subschema.get("properties", {})
        for key, child in value.items():
            if key in properties:
                errors.extend(validate_schema(child, properties[key], root_schema, f"{path}.{key}"))
            elif subschema.get("additionalProperties") is False:
                errors.append(f"{path}: unexpected property {key}")
    return errors


def dream_invariant_errors(schema_name: str, payload: dict[str, Any]) -> list[str]:
    """Enforce Dream Machine invariants that JSON Schema alone cannot express here."""
    errors: list[str] = []
    if schema_name == "claim" and not payload.get("source_chunks"):
        errors.append("INV-3/AT3: claim requires at least one source chunk")
    if schema_name == "canonical_map":
        canonicality = payload.get("canonicality", {})
        primary_sources = canonicality.get("primary_sources", []) if isinstance(canonicality, dict) else []
        if isinstance(primary_sources, list):
            for ref in primary_sources:
                if not isinstance(ref, str) or not REF_PATTERN.search(ref):
                    errors.append("INV-4/AT13: primary source ref does not match Dream ref grammar")
        if isinstance(canonicality, dict) and canonicality.get("status") == "canonical" and not any(isinstance(ref, str) and ref.startswith("act:") for ref in primary_sources):
            errors.append("INV-5/AT4: canonical status requires an admitted act: source")
    if schema_name == "dream_answer" and "unknowns" not in payload:
        errors.append("AT10: dream answers must expose unknowns")
    return errors


def validate_payload(schema_name: str, payload: dict[str, Any], schemas: dict[str, dict[str, Any]]) -> list[str]:
    schema = schemas[schema_name]
    return validate_schema(payload, schema, schema) + dream_invariant_errors(schema_name, payload)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_corpus_manifest(corpus: str | Path) -> dict[str, Any]:
    root = Path(corpus)
    if not root.exists():
        raise LabError(f"Dream corpus not found: {corpus}")
    files = [root] if root.is_file() else sorted(path for path in root.rglob("*") if path.is_file())
    manifest_files = []
    for path in files:
        relative = path.name if root.is_file() else str(path.relative_to(root))
        manifest_files.append({"path": relative, "size": path.stat().st_size, "sha256": _file_sha256(path)})
    return {
        "corpus": str(root),
        "kind": "file" if root.is_file() else "directory",
        "files": manifest_files,
    }


def ingest_corpus(db, corpus: str | Path) -> dict[str, Any]:
    manifest = build_corpus_manifest(corpus)
    manifest_hash = sha256_text(canonical_json(manifest))
    return append(
        db,
        {
            "who": "dream-machine",
            "did": "dream.ingest",
            "this": manifest_hash,
            "when": datetime.now(timezone.utc).isoformat(),
            "confirmed_by": "dream.ingest",
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "discard_material",
            "status": "candidate",
            "material_id": f"material:{manifest_hash}",
            "corpus_manifest_hash": manifest_hash,
            "corpus_manifest": manifest,
            "external_effect": False,
            "activates_process": False,
        },
    )


def propose_question(db, question: str) -> dict[str, Any]:
    proposal = {
        "question": question,
        "answer": None,
        "unknowns": ["Dream Machine synthesis and human review are still required."],
        "candidate_artifacts": [],
    }
    proposal_hash = sha256_text(canonical_json(proposal))
    return append(
        db,
        {
            "who": "dream-machine",
            "did": "dream.proposal",
            "this": proposal_hash,
            "when": datetime.now(timezone.utc).isoformat(),
            "confirmed_by": "dream.propose",
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "discard_proposal",
            "status": "candidate",
            "question": question,
            "answer": None,
            "unknowns": proposal["unknowns"],
            "proposal_hash": proposal_hash,
            "proposal": proposal,
            "external_effect": False,
            "activates_process": False,
        },
    )


def register_candidate(
    db,
    schema_name: str,
    payload: dict[str, Any],
    *,
    schemas: dict[str, dict[str, Any]] | None = None,
    root: str | Path = DREAM_ROOT_DEFAULT,
) -> dict[str, Any]:
    schemas = schemas or load_schemas(root)
    if schema_name not in schemas:
        raise LabError(f"unknown Dream schema: {schema_name}")
    errors = validate_payload(schema_name, payload, schemas)
    if errors:
        raise LabError(f"Dream payload invalid: {'; '.join(errors)}")
    payload_hash = sha256_text(canonical_json(payload))
    return append(
        db,
        {
            "who": "dream-machine",
            "did": "dream.candidate",
            "this": payload_hash,
            "when": datetime.now(timezone.utc).isoformat(),
            "confirmed_by": "dream.verify",
            "if_ok": "attention-raise.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "discard_candidate",
            "status": "candidate",
            "schema_name": schema_name,
            "dream_payload_hash": payload_hash,
            "dream_payload": payload,
            "external_effect": False,
            "activates_process": False,
        },
    )


def verify_dream_machine(root: str | Path = DREAM_ROOT_DEFAULT) -> dict[str, Any]:
    base = resource_path(str(root)) if str(root) == DREAM_ROOT_DEFAULT else Path(root)
    missing_files = [key for key, rel in REQUIRED_DREAM_FILES.items() if not (base / rel).is_file()]
    missing_schemas = [key for key, rel in SCHEMA_FILES.items() if not (base / rel).is_file()]
    schemas = load_schemas(base) if not missing_schemas else {}
    cases = load_examples(base)
    results: list[dict[str, Any]] = []
    for case in cases:
        errors = validate_payload(case.schema_name, case.payload, schemas)
        valid = not errors
        results.append(
            {
                "path": case.path,
                "schema": case.schema_name,
                "expect_valid": case.expect_valid,
                "valid": valid,
                "ok": valid == case.expect_valid,
                "errors": errors,
            }
        )
    failures = [result for result in results if not result["ok"]]
    return {
        "ok": not missing_files and not missing_schemas and not failures,
        "root": str(base),
        "required_files": {key: {"path": rel, "present": key not in missing_files} for key, rel in REQUIRED_DREAM_FILES.items()},
        "schemas": {key: {"path": rel, "present": key not in missing_schemas} for key, rel in SCHEMA_FILES.items()},
        "missing_files": missing_files,
        "missing_schemas": missing_schemas,
        "examples": len(results),
        "valid_examples": sum(1 for result in results if result["expect_valid"]),
        "invalid_examples": sum(1 for result in results if not result["expect_valid"]),
        "failures": failures,
        "results": results,
    }
