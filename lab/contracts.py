from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Any

from .resources import resource_path

@dataclass(frozen=True)
class ProcessContract:
    process_id: str
    title: str = ""
    status: str = "active"
    kind: str = ""
    version: str = ""
    owner: str = ""
    process_class: str = ""
    organ: str = "law"
    wakes: tuple[str, ...] = ()
    requires_infra: tuple[str, ...] = ()
    composable: bool = False
    requires_target_hash: bool = False
    idempotency: str = "none"
    evidence_required: bool = False
    required_slots: tuple[str, ...] = ()
    must_include: tuple[str, ...] = ()
    optional_aux: tuple[str, ...] = ()
    allowed_who: tuple[str, ...] = ()
    required_grants: tuple[str, ...] = ()
    adapters: tuple[str, ...] = ()
    danger_tier: str = "L0"
    evidence_obligation: str = "separate-result-act"
    evidence_must_include: tuple[str, ...] = ()
    budget_policy: dict[str, str] = field(default_factory=dict)
    closure_shape: dict[str, str] = field(default_factory=dict)
    if_doubt_behavior: str = "attention_raise"
    runtime_readiness_checks: tuple[str, ...] = ()
    doubt_path: str = "attention-raise.v1"

DEFAULT_REQUIRED=("who","did","this","when","confirmed_by","if_ok","if_doubt","if_not","status")

def _strip_comment(line: str) -> str:
    """Drop a trailing YAML comment, honouring quotes.

    ``status: active   # note`` must parse as ``active``; before this, the comment
    became part of the value and the process silently read as not-active.
    A ``#`` only starts a comment at line start or after whitespace, so values
    that legitimately contain ``#`` survive.
    """
    out: list[str] = []
    quote: str | None = None
    prev_space = True
    for ch in line:
        if quote is not None:
            out.append(ch)
            if ch == quote:
                quote = None
            prev_space = False
            continue
        if ch in '"\'':
            quote = ch
            out.append(ch)
            prev_space = False
            continue
        if ch == '#' and prev_space:
            break
        out.append(ch)
        prev_space = ch.isspace()
    return "".join(out).rstrip()

def _fold_block_sequences(lines: list[str]) -> list[str]:
    """Rewrite YAML block sequences into the inline form the parser understands.

    ``must_include:`` followed by ``- alpha`` / ``- beta`` becomes
    ``must_include: [alpha, beta]``. Without this the items were dropped in
    silence and a contract lost its declared obligations — an act missing every
    required field then read as complete and activated (fail-open).
    """
    folded: list[str] = []
    index = 0
    while index < len(lines):
        raw = lines[index]
        stripped = _strip_comment(raw).strip()
        if stripped.endswith(":") and not stripped.startswith("- "):
            key_indent = len(raw) - len(raw.lstrip(" "))
            items: list[str] = []
            look = index + 1
            while look < len(lines):
                candidate_raw = lines[look]
                candidate = _strip_comment(candidate_raw).strip()
                if not candidate:
                    look += 1
                    continue
                candidate_indent = len(candidate_raw) - len(candidate_raw.lstrip(" "))
                if candidate.startswith("- ") and candidate_indent > key_indent:
                    items.append(candidate[2:].strip())
                    look += 1
                    continue
                break
            if items:
                folded.append(f"{' ' * key_indent}{stripped[:-1]}: [{', '.join(items)}]")
                index = look
                continue
        folded.append(raw)
        index += 1
    return folded

def _list(line: str) -> tuple[str, ...]:
    m=re.search(r"\[(.*)\]", line)
    if not m: return ()
    return tuple(x.strip().strip('"\'') for x in m.group(1).split(',') if x.strip())

def _parse_value(value: str) -> Any:
    value=value.strip()
    if value.startswith("[") and value.endswith("]"):
        return _list(f"x: {value}")
    if value in {"true", "false"}:
        return value == "true"
    return value.strip('"\'')

def _parent(stack: list[tuple[int, str]], indent: int) -> str:
    parents=[key for level,key in stack if level < indent]
    return ".".join(parents)

def load_contract(path: str | Path) -> ProcessContract:
    data={
        "status": "active",
        "required_slots": DEFAULT_REQUIRED,
        "must_include": (),
        "optional_aux": (),
        "adapters": (),
        "danger_tier": "L0",
        "budget_policy": {},
        "closure_shape": {},
    }
    slot_levels: dict[str, str] = {}
    stack: list[tuple[int, str]] = []
    for raw in _fold_block_sequences(Path(path).read_text().splitlines()):
        raw=_strip_comment(raw)
        if not raw.strip(): continue
        indent=len(raw) - len(raw.lstrip(" "))
        line=raw.strip()
        while stack and stack[-1][0] >= indent:
            stack.pop()
        parent=_parent(stack, indent)
        if line.endswith(":") and not line.startswith("- "):
            stack.append((indent, line[:-1].strip()))
            continue
        if ":" not in line:
            # Never drop a line in silence again. Block sequences are folded above;
            # anything still unrecognised here is syntax this parser does not model,
            # and swallowing it is how a contract quietly loses a clause.
            raise ValueError(f"unparsed line in {path}: {line!r}")
        key, raw_value = line.split(':',1)
        key=key.strip()
        value=_parse_value(raw_value)
        if parent == "activation_ritual.required_slots":
            slot_levels[key] = str(value)
            continue
        if key == 'process_id': data['process_id']=str(value)
        elif key in {'title','status','kind','version','owner','process_class','organ','idempotency','doubt_path'}:
            data[key]=str(value)
        elif key in {'composable','requires_target_hash','evidence_required'}:
            data[key]=bool(value)
        elif key in {'wakes','requires_infra','adapters'}:
            data[key]=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif key == 'required_slots':
            data['required_slots']=tuple(value) if isinstance(value, tuple) else DEFAULT_REQUIRED
        elif parent == 'activation_ritual' and key == 'required_aux':
            data['must_include']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'activation_ritual' and key == 'optional_aux':
            data['optional_aux']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'authority_scope' and key == 'allowed_who':
            data['allowed_who']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'authority_scope' and key == 'required_grants':
            data['required_grants']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'adapter' and key == 'name':
            data['adapters']=(str(value),)
        elif key == 'danger_tier':
            data['danger_tier']=str(value)
        elif parent == 'adapter' and key == 'danger_tier':
            data['danger_tier']=str(value)
        elif key == 'evidence_obligation' and not parent:
            data['evidence_obligation']=str(value)
        elif key == 'evidence_must_include' and not parent:
            data['evidence_must_include']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'evidence_obligation' and key == 'required':
            data['evidence_required']=bool(value)
            data['evidence_obligation']='required' if value else 'none'
        elif parent == 'evidence_obligation' and key == 'must_include':
            data['evidence_must_include']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif key in {'must_include','required_aux'}:
            data['must_include']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif key == 'optional_aux':
            data['optional_aux']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif key == 'allowed_who':
            data['allowed_who']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif key == 'required_grants':
            data['required_grants']=tuple(value) if isinstance(value, tuple) else (str(value),)
        elif parent == 'budget_policy':
            data.setdefault('budget_policy', {})[key]=str(value)
        elif parent == 'closure_shape':
            data.setdefault('closure_shape', {})[key]=str(value)
        elif parent == 'if_doubt' and key == 'behavior':
            data['if_doubt_behavior']=str(value)
        elif parent == 'runtime_readiness' and key == 'checks':
            data['runtime_readiness_checks']=tuple(value) if isinstance(value, tuple) else (str(value),)
    if slot_levels:
        data['required_slots']=tuple(slot_levels.keys())
    if 'process_id' not in data: raise ValueError(f"missing process_id in {path}")
    return ProcessContract(**data)

CONTRACT_GLOB = '*.v*.yml'

def load_catalog(root: str | Path = 'processes') -> dict[str, ProcessContract]:
    """Load every versioned contract, not only ``.v1``.

    The glob was pinned to ``*.v1.yml``, so a ``.v2`` contract was invisible to the
    whole runtime — in a system whose contracts are versioned by name, that made
    every version after the first unreachable.
    """
    base = resource_path('processes') if str(root) == 'processes' and not Path(root).exists() else Path(root)
    return {c.process_id:c for c in (load_contract(p) for p in sorted(base.glob(CONTRACT_GLOB)))}
