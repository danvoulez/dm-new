import json
import os
import subprocess
import sys
from pathlib import Path

from lab.fleet import audit_fleet


def test_fleet_audit_requires_three_registered_machine_roles():
    result = audit_fleet("fleet")

    assert result["ok"], result
    assert set(result["roles"]) == {"bench", "capital", "engine"}
    assert {machine["machine_id"] for machine in result["machines"]} == {"lab-256", "lab-512", "lab-8gb"}
    for machine in result["machines"]:
        assert machine["operator_account"]
        assert machine["lab_root"]
        assert machine["deployed_cli_path"]
        assert machine["physical_dependencies"]
        assert machine["evidence_hashes"]


def test_fleet_services_match_allowlist_and_have_required_records():
    result = audit_fleet("fleet")

    assert result["unapproved_services"] == []
    assert result["service_count"] >= 3
    service_names = {service["service_name"] for service in result["services"]}
    assert {"receiver-selector", "clock-selector", "executor-dispatcher"}.issubset(service_names)
    for service in result["services"]:
        assert service["machine"]
        assert service["binary"]
        assert service["env_file"]
        assert service["logs"]
        assert service["restart_policy"]
        assert service["purpose"]
        assert service["health_check"]


def test_fleet_audit_detects_unapproved_resident_service(tmp_path):
    fleet = tmp_path / "fleet"
    machines = fleet / "machines"
    services = fleet / "services"
    machines.mkdir(parents=True)
    services.mkdir()
    (services / "allowlist.yml").write_text("resident_services: [receiver-selector]\n")
    (machines / "lab-8gb.yml").write_text(
        "\n".join(
            [
                "machine_id: lab-8gb",
                "hostname: lab-8gb.local",
                "role: capital",
                "operator_account: lab",
                "lab_root: /Lab",
                "deployed_cli_path: /Lab/bin/lab",
                "allowed_services: [receiver-selector]",
                "allowed_adapters: [receipt]",
                "forbidden_adapters: [worker_run]",
                "physical_dependencies: [power-cable:evidence]",
                "last_seen: 2026-06-22T00:00:00Z",
                "evidence_hashes: [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa]",
            ]
        )
    )
    (services / "receiver-selector.yml").write_text(
        "\n".join(
            [
                "service_name: receiver-selector",
                "machine: lab-8gb",
                "binary: /Lab/bin/receiver",
                "env_file: /Lab/.env.receiver",
                "logs: /Lab/logs/receiver.log",
                "restart_policy: launchd",
                "purpose: selector",
                "allowed_process_classes: [content]",
                "health_check: lab receiver status",
            ]
        )
    )
    (services / "one-daemon-per-idea.yml").write_text(
        "\n".join(
            [
                "service_name: one-daemon-per-idea",
                "machine: lab-8gb",
                "binary: /tmp/idea",
                "env_file: /tmp/env",
                "logs: /tmp/log",
                "restart_policy: launchd",
                "purpose: sprawl",
                "allowed_process_classes: [effect]",
                "health_check: false",
            ]
        )
    )

    result = audit_fleet(fleet)

    assert result["ok"] is False
    assert result["unapproved_services"] == ["one-daemon-per-idea"]


def test_fleet_audit_cli_reports_json():
    proc = subprocess.run(
        [sys.executable, "-m", "lab.cli", "fleet", "audit", "--root", "fleet"],
        cwd=os.getcwd(),
        env=os.environ | {"LAB_DB": ".lab/test-fleet.sqlite"},
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(proc.stdout)

    assert result["ok"] is True
    assert result["machine_count"] == 3
    assert result["unapproved_services"] == []
