# Dream Machine — Authoritative CLI Contract

**Status:** material specification. This is the single source of truth for the
`dream` command surface. Where spec §9, the task graph, or the schedule differ,
this file wins. Phase column = earliest phase the command is expected to work.

## Global

```text
dream [--root <path>] [--config <path>] [--json] <command> [flags]
  --root      corpus root (default: cwd)
  --config    config file (default: .dream/config.toml, then config.example.toml)
  --json      machine-readable output to stdout
All writes are confined to .dream/ (see INVARIANTS.md, AT1).
```

## Commands

```text
COMMAND              PHASE  PURPOSE / KEY FLAGS
-------------------  -----  --------------------------------------------------
init                 0      Create .dream/ tree + SQLite DB from db schema.
                              Idempotent. Re-run is a no-op if DB matches schema.

scan                 1      Walk root, hash files, write dm_sources/dm_artifacts.
                              --kind <repo|folder|...>   source kind (default: folder)
                              --changed                  only artifacts whose
                                                         content_sha256 changed
                              --roots-file <path>        scan multiple roots (schedule)
                              --out <dir>                also emit source_manifest.jsonl
                              Never modifies source. Ignores .git and .dream.

extract              1      Extract text + chunks for a source.
                              --source <source_id>       primary form (T4/runbook)
                              --manifest <jsonl>          batch form (§9); equals
                                                         running --source for each entry
                              Applies secret policy BEFORE writing text (SECRETS.md).

search               2      Lexical (ripgrep/FTS) search over chunks.
                              dream search "<query>"
                              --topic <t>  --limit <n>
                              Returns chunk refs with line ranges. No synthesis.

classify-docs        2      Label docs: guide|manual|rule|spec|plan|runbook|
                              reference|unknown. (stone 6)

mine-claims          3      Extract atomic claims (Claim Miner role).
                              --topic <t> --limit <n>    targeted form (§9)
                              --new-chunks               unprocessed chunks (schedule)
                              Validates each claim vs schemas/claim.schema.json;
                              rejects claims with empty source_chunks (AT3).

canon-map            4      Build canonical map for a topic.
                              --topic <t>                LLM Canonical Judge
                              --manual <chunk:..> ...    deterministic, no LLM (T6)
                              --active-topics            refresh known topics (schedule)

contradictions       4      Detect conflicting claims.
                              --topic <t> | --hot-topics

drift                5      Compare claims vs implementation evidence.
                              dream drift docs-code [--changed] [--root <p>]
                              Subjects: docs-code | spec-ui | schema-migration | ...

ask                  6      Evidence-backed answer (Dream Synthesizer + Critic).
                              dream ask "<question>"
                              Output matches schemas/dream_answer.schema.json.
                              Must include evidence, confidence, contradictions,
                              unknowns, actions (AT10).

ui-lineage           7      Group screenshots/routes/components.
                              --screenshots <dir> --routes <dir>

simulate             8      Shadow impact analysis only (AT8).
                              --change <change.yaml>

declared-drift-finding 9   Gate bridge candidate Act emitter (propose-only).
                              --propose --this <ref> [--evidence <ref> ...]

opened-research-ghost 9    Gate bridge candidate Act emitter (propose-only).
                              --propose --this <ref> [--evidence <ref> ...]

registered-canonical-map 9 Gate bridge candidate Act emitter (propose-only).
                              --propose --this <ref> [--evidence <ref> ...]

proposed-patch       9      Gate bridge candidate Act emitter (propose-only).
                              --propose --this <ref> [--evidence <ref> ...]

registered-source-material 9 Gate bridge candidate Act emitter (propose-only).
                              --propose --this <ref> [--evidence <ref> ...]

audit                nightly Full corpus audit: rescan + re-extract changed +
                              mine new chunks + contradiction sweep + drift on
                              changed repos. Embedding rebuild only if config
                              enables embeddings AND secret policy is satisfied.
                              dream audit --full

morning              6      Compressed brief grouped by topic / contradictions /
                              decisions / blocked items (AT15), not raw logs.
                              dream morning --since 24h

model-export         10     Export private local role datasets only: claims with spans,
                              refuse unsupported canonicality, identify stale,
                              material-vs-Act, patch with rollback, uncertainty as Ghost.

model-eval           10     Run the local eval gate before any LoRA. Requires
                              false_citation_rate == 0 and threshold counts.

model-train          10     Training gate. Refuses to train until Phase 10
                              thresholds and evals pass; never uploads corpus.
```

## Notes

- `search` and `audit` were missing from spec §9 / §10; they are defined here and
  should be added to the HTTP surface (§10) as `POST /search`, `POST /audit`.
- Commands with both a targeted flag (`--topic`) and a batch flag
  (`--new-chunks`/`--hot-topics`/`--active-topics`) are the same command in two
  modes; targeted is interactive, batch is for the schedule (`schedules/`).
- Any command requiring an external model aborts unless an explicit run envelope
  authorizes it (DM-L7, AT12).
