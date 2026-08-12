#!/usr/bin/env python3
"""Verify the packaged resource mirror against canonical repository sources."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'lab'/'resources'/'MANIFEST.json'

def digest(path: Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()

def main() -> int:
    data=json.loads(MANIFEST.read_text(encoding='utf-8'))
    failures=[]
    for item in data.get('files',[]):
        src=ROOT/item['source']
        mirror=ROOT/'lab'/'resources'/item['source']
        for label,path in [('source',src),('mirror',mirror)]:
            if not path.is_file():
                failures.append(f"missing {label}: {item['source']}")
                continue
            if path.stat().st_size != item['size']:
                failures.append(f"size mismatch {label}: {item['source']}")
            if digest(path) != item['sha256']:
                failures.append(f"sha256 mismatch {label}: {item['source']}")
    print(json.dumps({'ok':not failures,'files':len(data.get('files',[])),'failures':failures},indent=2,sort_keys=True))
    return 0 if not failures else 1
if __name__=='__main__':
    raise SystemExit(main())
