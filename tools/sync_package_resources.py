#!/usr/bin/env python3
"""Build deterministic package resources from the canonical repository sources.

The top-level directories remain canonical in source control.  The wheel carries a
byte-for-byte resource mirror under ``lab/resources`` so installed CLI commands do not
depend on a checkout.  The generated manifest records source path, size, and SHA-256 for
every copied file; the acceptance script verifies the mirror before release.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "lab" / "resources"
TREES = [
    "processes",
    "fleet",
    "schemas",
    "migrations",
    "tests/fixtures",
    "prompts",
]
FILES = [
    "MODEL_REGISTRY.md",
    "PROMPT_REGISTRY.md",
    "SCHEMA_REGISTRY.md",
    "LLM_RECEIPT.v1.md",
]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
    records = []

    for rel in TREES:
        source = ROOT / rel
        target = DEST / rel
        if not source.exists():
            raise SystemExit(f"missing resource tree: {rel}")
        for path in sorted(p for p in source.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
            child = path.relative_to(ROOT)
            out = DEST / child
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, out)
            records.append({"source": str(child), "size": path.stat().st_size, "sha256": digest(path)})

    for rel in FILES:
        source = ROOT / rel
        if not source.is_file():
            raise SystemExit(f"missing resource file: {rel}")
        out = DEST / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, out)
        records.append({"source": rel, "size": source.stat().st_size, "sha256": digest(source)})

    manifest = {"format": "dream-machine-lab.resources.v1", "files": records}
    (DEST / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(records), "destination": str(DEST)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
