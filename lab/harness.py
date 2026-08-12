"""Santo André Lab Pack vector harness.

This module is the production-local harness for the pack vectors kept under
``tests/fixtures/santo-andre-vectors/``.  Vectors live in ``valid/``, ``invalid/``
and ``ambiguous/`` directories whose names are the expected verdict.  The harness
validates each vector's fixture envelope and applies pack-stage interpretation
checks from the Lab Pack law set.  The checks intentionally run *after* foundation
Canon in the source pack: this harness does not recompute LogLine receipt hashes;
it verifies that the Lab runtime reads pack obligations without improvising routes
or creating false greens.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .resources import resource_path

HEX64 = re.compile(r"^[0-9a-f]{64}$")
CANON_SLOTS = ("who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status")
PACK_HASH_FIELDS = ("pack", "template", "workflow", "policy", "qualifier", "runtime", "run")
VECTORS_DEFAULT = "tests/fixtures/santo-andre-vectors"
VERDICTS = {"valid", "invalid", "ambiguous"}


@dataclass(frozen=True)
class VectorSource:
    """A vector plus its location and expected directory verdict."""

    path: str
    category: str
    vector: dict[str, Any]


def is_hash(value: Any) -> bool:
    return isinstance(value, str) and bool(HEX64.match(value))


def is_zero_or_hash(value: Any) -> bool:
    return value == "0" or is_hash(value)


def _transport(vector: dict[str, Any]) -> dict[str, Any]:
    transport = vector.get("envelope", {}).get("transport", {})
    return transport if isinstance(transport, dict) else {}


def _act_entries(vector: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(vector.get("acts"), list):
        return [entry for entry in vector["acts"] if isinstance(entry, dict)]
    if isinstance(vector.get("act"), dict):
        return [{"role": "single", "act": vector["act"]}]
    return []


def _acts(vector: dict[str, Any]) -> list[dict[str, Any]]:
    acts: list[dict[str, Any]] = []
    for entry in _act_entries(vector):
        act = entry.get("act", entry)
        if isinstance(act, dict):
            acts.append(act)
    return acts


def _workflow_steps(vector: dict[str, Any]) -> list[dict[str, Any]]:
    workflow = vector.get("workflow")
    if not isinstance(workflow, dict):
        return []
    steps = workflow.get("steps", [])
    return [step for step in steps if isinstance(step, dict)]


def build_registry(sources: list[VectorSource]) -> dict[str, set[str]]:
    """Build a fixture-local registry from vectors expected to be valid.

    The seed vectors use placeholder hashes.  Rather than hard-code those hashes
    in runtime code, the harness treats valid fixtures as the registered pack
    universe and then checks invalid/ambiguous fixtures against that universe.
    """
    registry = {field: set() for field in PACK_HASH_FIELDS if field != "run"}
    for source in sources:
        if source.vector.get("expect") != "valid":
            continue
        for act in _acts(source.vector):
            for field in registry:
                value = act.get(field)
                if is_hash(value):
                    registry[field].add(value)
        workflow = source.vector.get("workflow")
        if isinstance(workflow, dict) and is_hash(workflow.get("workflow")):
            registry["workflow"].add(workflow["workflow"])
        for step in _workflow_steps(source.vector):
            mapped = {
                "template": step.get("accepts_template"),
                "policy": step.get("policy"),
                "qualifier": step.get("qualifier"),
                "runtime": step.get("runtime"),
            }
            for field, value in mapped.items():
                if is_hash(value):
                    registry[field].add(value)
    return registry


def load_vector_sources(root: str | Path = VECTORS_DEFAULT) -> list[VectorSource]:
    """Load vector JSON files with their source paths and verdict directories.

    Each vector's parent directory name (``valid``/``invalid``/``ambiguous``) is its
    expected verdict category.
    """
    sources: list[VectorSource] = []
    base = resource_path(str(root)) if str(root) == VECTORS_DEFAULT else Path(root)
    for path in sorted(base.rglob("*.json")):
        sources.append(VectorSource(str(path), path.parent.name, json.loads(path.read_text(encoding="utf-8"))))
    return sources


def load_vectors(root: str | Path = VECTORS_DEFAULT) -> list[dict[str, Any]]:
    return [source.vector for source in load_vector_sources(root)]


def _schema_problems(source: VectorSource) -> list[str]:
    vector = source.vector
    problems: list[str] = []
    filename = Path(source.path).stem
    if vector.get("vector") != filename:
        problems.append("vector name must match filename")
    if vector.get("expect") not in VERDICTS:
        problems.append("expect must be valid, invalid, or ambiguous")
    elif vector.get("expect") != source.category:
        problems.append("expect must match vector directory")
    if not isinstance(vector.get("tests"), list) or not vector.get("tests"):
        problems.append("tests must name at least one pack law")
    if not isinstance(vector.get("reason"), str) or not vector.get("reason"):
        problems.append("reason is required")
    if "act" in vector and "acts" in vector:
        problems.append("vector must not carry both act and acts")
    if "act" not in vector and "acts" not in vector and "workflow" not in vector:
        problems.append("vector must carry act, acts, or workflow")
    return problems


def _act_shape_problems(act: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    for slot in CANON_SLOTS:
        if slot not in act:
            problems.append(f"missing canon slot: {slot}")
        elif not isinstance(act[slot], str):
            problems.append(f"canon slot must be a string: {slot}")
    for forbidden in ("transport", "result", "evidence"):
        if forbidden in act:
            problems.append(f"forbidden resting Act field: {forbidden}")
    for field in PACK_HASH_FIELDS:
        if field in act and not is_zero_or_hash(act[field]):
            problems.append(f"{field} must be 0 or 64-hex hash")
    return problems


def judge_vector(source: VectorSource | dict[str, Any], registry: dict[str, set[str]] | None = None) -> dict[str, Any]:
    """Return a pack-stage verdict for a vector source or raw vector dict."""
    if isinstance(source, dict):
        source = VectorSource("<memory>/unknown.json", source.get("expect", "unknown"), source)
    registry = registry or {field: set() for field in PACK_HASH_FIELDS if field != "run"}
    vector = source.vector
    problems = _schema_problems(source)
    ghosts: list[str] = []
    entries = _act_entries(vector)
    acts = _acts(vector)
    roles = {entry.get("role") for entry in entries}
    transport = _transport(vector)

    if acts:
        if not transport.get("sent_to"):
            problems.append("missing transport.sent_to")
        elif not is_hash(transport.get("sent_to")):
            problems.append("transport.sent_to must cite a hash")

    for act in acts:
        problems.extend(_act_shape_problems(act))
        if act.get("qualifier") == "0" and (act.get("runtime") != "0" or act.get("run") != "0"):
            problems.append("register-only requires qualifier/runtime/run = 0/0/0")
        if act.get("qualifier") not in (None, "0") and not is_hash(act.get("qualifier")):
            problems.append("nonzero qualifier must be a hash")
        if act.get("did") == "requested" and act.get("run") not in (None, "0"):
            problems.append("request Act must not carry a run hash")
        if (
            act.get("did") in {"reported", "completed"}
            and is_hash(act.get("run"))
            and "request" not in roles
            and not act.get("run_evidence_resolved", False)
        ):
            ghosts.append("run evidence cannot be resolved")
        if is_hash(act.get("pack")) and registry.get("pack") and act["pack"] not in registry["pack"]:
            ghosts.append("pack reference is not current/resolved")
        if is_hash(act.get("policy")) and registry.get("policy") and act["policy"] not in registry["policy"]:
            problems.append("policy hash is not registered")
        if act.get("type") == "card" and registry.get("template") and act.get("template") not in registry["template"]:
            problems.append("type field cannot be authority")

    workflow = vector.get("workflow")
    if isinstance(workflow, dict):
        if not is_hash(workflow.get("workflow")):
            problems.append("workflow id must be a hash")
        for step in _workflow_steps(vector):
            for field in ("accepts_template", "policy", "qualifier", "runtime", "from_sent_to", "next_if_ok", "next_if_doubt", "next_if_not"):
                value = step.get(field)
                ok = is_zero_or_hash(value) if field in {"qualifier", "runtime"} else is_hash(value)
                if not ok:
                    problems.append(f"workflow step {field} must cite a hash")
        target = transport.get("sent_to")
        if target:
            legal = {step.get(k) for step in _workflow_steps(vector) for k in ("from_sent_to", "next_if_ok", "next_if_doubt", "next_if_not")}
            if target not in legal:
                problems.append("transport.sent_to is off workflow reel")

    refs = vector.get("references", {}) if isinstance(vector.get("references"), dict) else {}
    route_workflow = vector.get("route_workflow") or refs.get("route_workflow")
    if (refs.get("workflow_versions_conflict") or route_workflow) and acts and acts[0].get("workflow") != route_workflow:
        ghosts.append("conflicting workflow versions")

    verdict = "invalid" if problems else "ambiguous" if ghosts else "valid"
    return {
        "source": source.path,
        "vector": vector.get("vector"),
        "expect": vector.get("expect"),
        "verdict": verdict,
        "ok": verdict == vector.get("expect"),
        "problems": sorted(set(problems)),
        "ghosts": sorted(set(ghosts)),
    }


def run_harness(root: str | Path = VECTORS_DEFAULT) -> dict[str, Any]:
    sources = load_vector_sources(root)
    registry = build_registry(sources)
    results = [judge_vector(source, registry) for source in sources]
    failures = [item for item in results if not item["ok"]]
    counts = {verdict: sum(1 for item in results if item["verdict"] == verdict) for verdict in sorted(VERDICTS)}
    return {
        "ok": not failures,
        "count": len(results),
        "counts": counts,
        "registry_counts": {field: len(values) for field, values in sorted(registry.items())},
        "failures": failures,
        "results": results,
    }
