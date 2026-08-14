"""Generate the Worker and Postgres process-contract seed artifacts."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from lab.contracts import load_catalog


TYPESCRIPT_OUT = Path("workers/api/src/seed-contracts.ts")
MIGRATION_OUT = Path("migrations/0004_process_contracts.sql")


def seed_rows(process_root: Path) -> list[dict[str, Any]]:
    catalog = load_catalog(process_root)
    return [
        {
            "process_id": contract.process_id,
            "title": contract.title or contract.process_id,
            "status": contract.status,
            "source_yml": f"{process_root.name}/{contract.process_id}.yml",
            "contract": asdict(contract),
        }
        for contract in (catalog[process_id] for process_id in sorted(catalog))
    ]


def render_typescript(rows: list[dict[str, Any]]) -> str:
    payload = json.dumps(rows, ensure_ascii=False, indent=2)
    return f"// Generated from processes/*.yml through lab.contracts.load_catalog.\nexport const SEED_CONTRACTS = {payload} as const;\n"


def _sql_literal(value: str) -> str:
    return value.replace("'", "''")


def render_migration(rows: list[dict[str, Any]]) -> str:
    lines = [
        "-- Process contracts promoted from processes/*.yml. Generated from the kernel parser.",
        "create table if not exists public.process_contracts (",
        "  process_id text primary key,",
        "  title text not null,",
        "  contract jsonb not null,",
        "  status text not null default 'active',",
        "  source_yml text,",
        "  registered_hash text references public.logline_acts(content_hash),",
        "  created_at timestamptz not null default now()",
        ");",
        "",
    ]
    for row in rows:
        contract = json.dumps(row["contract"], ensure_ascii=False, separators=(",", ":"))
        values = [
            _sql_literal(str(row["process_id"])),
            _sql_literal(str(row["title"])),
            _sql_literal(contract),
            _sql_literal(str(row["status"])),
            _sql_literal(str(row["source_yml"])),
        ]
        lines.extend(
            [
                "insert into public.process_contracts(process_id,title,contract,status,source_yml) values (",
                f"  '{values[0]}','{values[1]}','{values[2]}'::jsonb,'{values[3]}','{values[4]}'",
                ") on conflict (process_id) do update set "
                "registered_hash=case when public.process_contracts.contract=excluded.contract "
                "then public.process_contracts.registered_hash else null end, "
                "title=excluded.title, contract=excluded.contract, status=excluded.status, source_yml=excluded.source_yml;",
                "",
            ]
        )
    return "\n".join(lines)


def generated_artifacts(repo_root: Path) -> dict[Path, str]:
    rows = seed_rows(repo_root / "processes")
    return {
        TYPESCRIPT_OUT: render_typescript(rows),
        MIGRATION_OUT: render_migration(rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when generated files differ")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args()

    artifacts = generated_artifacts(args.repo_root)
    stale: list[str] = []
    for relative_path, content in artifacts.items():
        output_path = args.repo_root / relative_path
        if args.check:
            if not output_path.exists() or output_path.read_text(encoding="utf-8") != content:
                stale.append(str(relative_path))
            continue
        output_path.write_text(content, encoding="utf-8")

    if stale:
        print("stale generated process-contract artifacts: " + ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
