"""Generated process catalog and runnable-process reports."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .adapters import REGISTRY
from .contracts import ProcessContract, load_catalog

DANGEROUS_BLOCKED = {"L4", "L5"}
OUTPUT_FILES = ["PROCESS_CATALOG.md", "CURRENT_RUNNABLE_PROCESSES.md"]


def _contract_row(contract: ProcessContract) -> dict[str, Any]:
    return {
        "process_id": contract.process_id,
        "title": contract.title,
        "status": contract.status,
        "kind": contract.kind,
        "version": contract.version,
        "owner": contract.owner,
        "process_class": contract.process_class,
        "organ": contract.organ,
        "wakes": list(contract.wakes),
        "requires_infra": list(contract.requires_infra),
        "composable": contract.composable,
        "requires_target_hash": contract.requires_target_hash,
        "idempotency": contract.idempotency,
        "evidence_required": contract.evidence_required,
        "adapters": list(contract.adapters),
        "danger_tier": contract.danger_tier,
        "evidence_obligation": contract.evidence_obligation,
        "evidence_must_include": list(contract.evidence_must_include),
        "required_grants": list(contract.required_grants),
        "doubt_path": contract.doubt_path,
        "required_slots": list(contract.required_slots),
        "must_include": list(contract.must_include),
        "optional_aux": list(contract.optional_aux),
    }


def build_process_catalog(root: str | Path = "processes") -> dict[str, Any]:
    contracts = load_catalog(root)
    processes = [_contract_row(contracts[key]) for key in sorted(contracts)]
    return {"source": "processes/*.v1.yml", "processes": processes}


def _readiness(contract: ProcessContract) -> tuple[str, str]:
    if contract.status != "active":
        return "not-runnable", f"process status is {contract.status}"
    if contract.danger_tier in DANGEROUS_BLOCKED:
        return "blocked", "requires grant/budget/sandbox"
    missing_adapters = [adapter for adapter in contract.adapters if adapter not in REGISTRY]
    if missing_adapters:
        return "contract-only", f"adapter not configured: {', '.join(missing_adapters)}"
    if not contract.adapters:
        return "contract-only", "no adapter configured"
    return "runnable", "contract active and adapter configured"


def build_runnable_processes(root: str | Path = "processes") -> dict[str, Any]:
    contracts = load_catalog(root)
    processes: list[dict[str, Any]] = []
    for key in sorted(contracts):
        contract = contracts[key]
        status, reason = _readiness(contract)
        processes.append(
            {
                "process_id": contract.process_id,
                "status": status,
                "reason": reason,
                "adapters": list(contract.adapters),
                "danger_tier": contract.danger_tier,
            }
        )
    return {
        "source": "processes/*.v1.yml",
        "derived_from": ["process contracts", "adapter registry", "grant/budget/sandbox policy"],
        "processes": processes,
    }


def _adapter_text(adapters: list[str]) -> str:
    return ", ".join(adapters) if adapters else "-"


def render_process_catalog(catalog: dict[str, Any]) -> str:
    lines = [
        "# Process Catalog",
        "",
        "Generated from `processes/*.v1.yml`. Contracts define activation law; they do not own runtimes.",
        "",
        "| Process | Status | Adapter(s) | Danger | Evidence |",
        "|---|---|---|---|---|",
    ]
    for item in catalog["processes"]:
        lines.append(
            f"| {item['process_id']} | {item['status']} | {_adapter_text(item['adapters'])} | {item['danger_tier']} | {item['evidence_obligation']} |"
        )
    lines.append("")
    return "\n".join(lines)


def render_runnable_processes(runnable: dict[str, Any]) -> str:
    lines = [
        "# Current Runnable Processes",
        "",
        "Generated from `processes/*.v1.yml`, adapter registry, service/policy readiness, and grant/budget/sandbox policy. Do not hand-edit.",
        "",
        "| Process | Status | Reason |",
        "|---|---|---|",
    ]
    for item in runnable["processes"]:
        lines.append(f"| {item['process_id']} | {item['status']} | {item['reason']} |")
    lines.append("")
    return "\n".join(lines)


def write_generated_process_files(root: str | Path = "processes", out: str | Path | None = None) -> dict[str, Any]:
    output_dir = Path(out) if out is not None else Path(root)
    output_dir.mkdir(parents=True, exist_ok=True)
    catalog = build_process_catalog(root)
    runnable = build_runnable_processes(root)
    (output_dir / "PROCESS_CATALOG.md").write_text(render_process_catalog(catalog), encoding="utf-8")
    (output_dir / "CURRENT_RUNNABLE_PROCESSES.md").write_text(render_runnable_processes(runnable), encoding="utf-8")
    return {"generated": OUTPUT_FILES, "out": str(output_dir), "processes": len(catalog["processes"])}
