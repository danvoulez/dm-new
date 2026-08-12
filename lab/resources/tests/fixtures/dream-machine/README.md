# Dream Machine Implementation Spec Pack

Status: implementation specification, not semantic authority.
Scope: Santo André Laboratory / LogLine / ActGraph ecosystem.
Purpose: give Codex/Devin/LLM repo agents a granular, consumable plan for building Dream Machine: a self-auditing imagination engine for living systems.

Core boundary:

```text
Dream Machine may ingest, classify, compare, simulate, synthesize, and propose.
Dream Machine may not become semantic authority.
Only admitted Acts create durable consequence.
```

Primary files:

- `DREAM_MACHINE_IMPLEMENTATION_SPEC.md`
- `IMPLEMENTATION_PROMPT.md` — master build prompt, Phases 0–10 (start here to build)
- `CODEX_HANDOFF_PROMPT.md` — quickstart for the first stone only
- `TASK_GRAPH.md`
- `ACCEPTANCE_TESTS.md`
- `RISKS_AND_MITIGATIONS.md`
- `DECISIONS_FOR_DAN.md`
- `db/dream_machine_schema.sql`
- `schemas/*.schema.json`
- `prompts/*.md`
- `contracts/*.candidate.act.json`

Build contracts (authoritative for implementers; resolve gaps in the spec prose):

- `IDS.md` — deterministic identifier derivation (AT2)
- `CLI.md` — single source of truth for the `dream` command surface
- `INVARIANTS.md` — properties enforced in code, mapped to acceptance tests
- `SECRETS.md` — secret-handling policy at extract time (AT11, DM-L8)
- `config.example.toml` — scan/extract/chunk/secret/canon config + hash inputs
- `examples/valid/*` and `examples/invalid/*` — golden fixtures per schema
- `tasks/stone_01_ingest.md` — the first build stone
- `CHANGES.md` — what changed in this pass and why

Conformance:

- `tools/conformance.py` + `make verify` — proves the pack conforms to its own
  contracts: JSON parses, fixtures validate/reject correctly, DB `CHECK` enums match
  the JSON Schema enums, CLI commands reconcile with spec/taskgraph/schedule, config
  hashes are reproducible. Stdlib-only; `make deps` adds jsonschema/pyyaml for the
  full (un-skipped) run.

