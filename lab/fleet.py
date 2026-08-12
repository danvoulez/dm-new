"""Fleet registry and resident service allowlist audit."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .resources import resource_path

MACHINE_REQUIRED = (
    "machine_id",
    "hostname",
    "role",
    "operator_account",
    "lab_root",
    "deployed_cli_path",
    "allowed_services",
    "allowed_adapters",
    "forbidden_adapters",
    "physical_dependencies",
    "last_seen",
    "evidence_hashes",
)
SERVICE_REQUIRED = (
    "service_name",
    "machine",
    "binary",
    "env_file",
    "logs",
    "restart_policy",
    "purpose",
    "allowed_process_classes",
    "health_check",
)


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        body = value[1:-1].strip()
        if not body:
            return []
        return [item.strip().strip("\"'") for item in body.split(",")]
    return value.strip("\"'")


def _read_simple_yaml(path: Path) -> dict[str, Any]:
    data: dict[str, Any] = {}
    current_key: str | None = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("- ") and current_key:
            data.setdefault(current_key, []).append(_parse_scalar(line[2:]))
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value:
            data[key] = _parse_scalar(value)
            current_key = None
        else:
            data[key] = []
            current_key = key
    return data


def _load_records(root: Path, subdir: str, required: tuple[str, ...]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    directory = root / subdir
    for path in sorted(directory.glob("*.yml")):
        if path.name == "allowlist.yml":
            continue
        record = _read_simple_yaml(path)
        record["_path"] = str(path)
        records.append(record)
        missing_fields = [field for field in required if not record.get(field)]
        if missing_fields:
            missing.append({"path": str(path), "missing": missing_fields})
    return records, missing


def audit_fleet(root: str | Path = "fleet") -> dict[str, Any]:
    root_path = resource_path("fleet") if str(root) == "fleet" and not Path(root).exists() else Path(root)
    machines, machine_missing = _load_records(root_path, "machines", MACHINE_REQUIRED)
    services, service_missing = _load_records(root_path, "services", SERVICE_REQUIRED)
    allowlist_path = root_path / "services" / "allowlist.yml"
    allowlist = _read_simple_yaml(allowlist_path).get("resident_services", []) if allowlist_path.exists() else []
    machine_ids = {machine.get("machine_id") for machine in machines}
    roles = sorted({machine.get("role") for machine in machines if machine.get("role")})
    unapproved_services = sorted(
        service.get("service_name", "")
        for service in services
        if service.get("service_name") and service.get("service_name") not in allowlist
    )
    unknown_machine_services = sorted(
        service.get("service_name", "")
        for service in services
        if service.get("machine") and service.get("machine") not in machine_ids
    )
    required_roles = {"bench", "capital", "engine"}
    missing_roles = sorted(required_roles.difference(roles))
    ok = not machine_missing and not service_missing and not unapproved_services and not unknown_machine_services and not missing_roles
    return {
        "ok": ok,
        "root": str(root_path),
        "machine_count": len(machines),
        "service_count": len(services),
        "roles": roles,
        "missing_roles": missing_roles,
        "machines": machines,
        "services": services,
        "allowlist": allowlist,
        "machine_missing_fields": machine_missing,
        "service_missing_fields": service_missing,
        "unapproved_services": unapproved_services,
        "unknown_machine_services": unknown_machine_services,
    }
