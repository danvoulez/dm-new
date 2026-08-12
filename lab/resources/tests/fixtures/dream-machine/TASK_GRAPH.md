# Dream Machine Task Graph

## T0 — Install spec pack

Purpose: place this pack under `docs/strategy/dream-machine/` or equivalent.

Files:

```text
DREAM_MACHINE_IMPLEMENTATION_SPEC.md
schemas/
prompts/
db/
tasks/
contracts/
```

No code changes.

## T1 — Create local material directory

Add `.dream/` to `.gitignore`.

Expected tree:

```text
.dream/
  db/dream.sqlite
  manifests/
  extractions/
  chunks/
  runs/
  index/
```

## T2 — Build `dream init`

Creates SQLite DB from `db/dream_machine_schema.sql`.

Acceptance:

```bash
dream init
sqlite3 .dream/db/dream.sqlite '.tables'
```

## T3 — Build scanner

Command:

```bash
dream scan --root . --kind repo
```

Must:

```text
walk files
ignore .git and .dream by default
compute sha256
detect file type
write dm_sources/dm_artifacts
not modify source files
```

## T4 — Build extractor/chunker

Command:

```bash
dream extract --source <source_id>
```

Supports text-like files first.

## T5 — Build lexical search

Command:

```bash
dream search "ActGraph gate"
```

Returns chunk refs with line ranges.

## T6 — Build manual canonical map

Command:

```bash
dream canon-map --topic "ActGraph gate" --manual chunk:a chunk:b
```

No LLM required.

## T7 — Add Claim Miner LLM role

Consumes selected chunks; validates output against schema.

## T8 — Add Canonical Judge LLM role

Consumes claims/evidence; outputs canonical map JSON.

## T9 — Add Contradiction Engine

Detects conflicting claims over same subject/predicate/scope.

## T10 — Add Drift Auditor

Checks claims against repo evidence.

## T11 — Add Dream Ask

Command:

```bash
dream ask "Which version is canonical?"
```

Requires citations, confidence, contradictions, unknowns.

## T12 — Add UI lineage

Screenshots and route/component similarity.

## T13 — Add simulation

Shadow impact analysis only.

## T14 — Add Gate bridge

Generates candidate Acts, never admits by default.


Phase 10 commands: dream model-export; dream model-eval; dream model-train.
