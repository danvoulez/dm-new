"""Santo André Lab Pack vector harness.

This module is the production-local harness for the pack vectors kept under
``tests/fixtures/santo-andre-vectors/``. Vectors live in ``valid/``, ``invalid/``
and ``ambiguous/`` directories whose names are the expected verdict. The harness
validates each vector's fixture shape and applies pack-stage interpretation checks
from the Lab Pack law set.

Routing law is intentionally aligned with LogLine v1.2 process custody: workflows
publish ``start`` + ``nodes``; every node names ``activity``, ``responsible`` and
``if_ok``/``if_doubt``/``if_not``; current work is a custody tuple. Historical
``sent_to``/``next_if_*`` routing fields are rejected rather than silently adapted.
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
OUTCOMES = {"ok", "doubt", "not"}
TERMINALS = {"stop", "close", "closed", "end"}
LEGACY_ROUTING_KEYS = {
    "sent_to",
    "from_sent_to",
    "next_if_ok",
    "next_if_doubt",
    "next_if_not",
    "expected_next_sent_to",
    "actual_next_sent_to",
}


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


def _custody(vector: dict[str, Any]) -> dict[str, Any]:
    custody = vector.get("custody", {})
    return custody if isinstance(custody, dict) else {}


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


def _workflow_nodes(vector: dict[str, Any]) -> dict[str, dict[str, Any]]:
    workflow = vector.get("workflow")
    if not isinstance(workflow, dict):
        return {}
    nodes = workflow.get("nodes", {})
    if not isinstance(nodes, dict):
        return {}
    return {str(node_id): node for node_id, node in nodes.items() if isinstance(node, dict)}


def _legacy_routing_problems(vector: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    envelope = vector.get("envelope")
    if isinstance(envelope, dict):
        transport = envelope.get("transport")
        if isinstance(transport, dict):
            for key in sorted(LEGACY_ROUTING_KEYS & set(transport)):
                problems.append(f"legacy routing field forbidden: envelope.transport.{key}")

    workflow = vector.get("workflow")
    if isinstance(workflow, dict):
        if "steps" in workflow:
            problems.append("legacy workflow.steps forbidden: use workflow.nodes")
        for node_id, node in _workflow_nodes(vector).items():
            for key in sorted(LEGACY_ROUTING_KEYS & set(node)):
                problems.append(f"legacy routing field forbidden: workflow.nodes.{node_id}.{key}")

    routing = vector.get("routing")
    if isinstance(routing, dict):
        for key in sorted(LEGACY_ROUTING_KEYS & set(routing)):
            problems.append(f"legacy routing field forbidden: routing.{key}")
    return problems


def build_registry(sources: list[VectorSource]) -> dict[str, set[str]]:
    """Build a fixture-local registry from vectors expected to be valid.

    The seed vectors use placeholder hashes. Rather than hard-code those hashes in
    runtime code, the harness treats valid fixtures as the registered pack universe.
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
        for node in _workflow_nodes(source.vector).values():
            mapped = {
                "template": node.get("accepts_template"),
                "policy": node.get("policy"),
                "qualifier": node.get("qualifier"),
                "runtime": node.get("runtime"),
            }
            for field, value in mapped.items():
                if is_hash(value):
                    registry[field].add(value)
    return registry


def load_vector_sources(root: str | Path = VECTORS_DEFAULT) -> list[VectorSource]:
    """Load vector JSON files with their source paths and verdict directories."""
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
    problems.extend(_legacy_routing_problems(vector))
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


def _workflow_problems(vector: dict[str, Any]) -> list[str]:
    workflow = vector.get("workflow")
    if not isinstance(workflow, dict):
        return []
    problems: list[str] = []
    if not is_hash(workflow.get("workflow")):
        problems.append("workflow id must be a hash")

    nodes = _workflow_nodes(vector)
    start = workflow.get("start")
    if not isinstance(start, str) or not start:
        problems.append("workflow start node is required")
    elif start not in nodes:
        problems.append("workflow start node must exist")
    if not nodes:
        problems.append("workflow nodes are required")
        return problems

    for node_id, node in nodes.items():
        activity = node.get("activity")
        responsible = node.get("responsible")
        if not isinstance(activity, str) or not activity.strip():
            problems.append(f"workflow node {node_id} activity is required")
        if not isinstance(responsible, str) or not responsible.strip():
            problems.append(f"workflow node {node_id} responsible is required")

        if "accepts_template" in node and not is_hash(node.get("accepts_template")):
            problems.append("workflow node accepts_template must cite a hash")
        if "policy" in node and not is_hash(node.get("policy")):
            problems.append("workflow node policy must cite a hash")
        for field in ("qualifier", "runtime"):
            if field in node and not is_zero_or_hash(node.get(field)):
                problems.append(f"workflow node {field} must be 0 or a hash")

        for outcome in sorted(OUTCOMES):
            field = f"if_{outcome}"
            target = node.get(field)
            if not isinstance(target, str) or not target:
                problems.append(f"workflow node {node_id} {field} is required")
            elif target not in TERMINALS and target not in nodes:
                problems.append(f"workflow node {node_id} {field} must name a defined node or terminal")

    custody = _custody(vector)
    node_id = custody.get("node")
    responsible = custody.get("responsible")
    if not isinstance(node_id, str) or not node_id:
        problems.append("workflow custody.node is required")
    elif node_id not in nodes:
        problems.append("custody.node is off workflow graph")
    elif responsible != nodes[node_id].get("responsible"):
        problems.append("custody.responsible does not match current workflow node")

    routing = vector.get("routing")
    if isinstance(routing, dict):
        route_node = routing.get("node")
        outcome = routing.get("outcome")
        if route_node not in nodes:
            problems.append("routing.node must name a defined workflow node")
        elif outcome not in OUTCOMES:
            problems.append("routing.outcome must be ok, doubt, or not")
        else:
            selected = nodes[route_node].get(f"if_{outcome}")
            expected_node = routing.get("expected_next_node")
            actual_node = routing.get("actual_next_node")
            if expected_node is not None and expected_node != selected:
                problems.append("routing expected next node does not match deterministic branch")
            if actual_node is not None and actual_node != selected:
                problems.append("routing actual next node violates deterministic branch")
            selected_node = nodes.get(str(selected)) if isinstance(selected, str) else None
            selected_responsible = selected_node.get("responsible") if selected_node else None
            expected_responsible = routing.get("expected_next_responsible")
            actual_responsible = routing.get("actual_next_responsible")
            if expected_responsible is not None and expected_responsible != selected_responsible:
                problems.append("routing expected next responsible does not match selected node")
            if actual_responsible is not None and actual_responsible != selected_responsible:
                problems.append("routing actual next responsible violates deterministic custody")
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
    custody = _custody(vector)

    if acts:
        responsible = custody.get("responsible")
        if not isinstance(responsible, str) or not responsible.strip():
            problems.append("missing custody.responsible")

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

    problems.extend(_workflow_problems(vector))

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
