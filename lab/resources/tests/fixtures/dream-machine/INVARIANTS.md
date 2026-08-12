# Dream Machine — Enforced Invariants

**Status:** material specification. These are properties the implementation must
*enforce in code*, not merely assert in prose. Each maps to an acceptance test.

## INV-1 — Write confinement (AT1)

```text
Every filesystem write goes through one guarded path that refuses any target
whose canonical, symlink-resolved absolute path is not inside <root>/.dream/.
scan/extract/search/mine never open a source file for writing.
Violation => hard error, no partial write.
Test: attempt to write outside .dream/ is rejected; `git status --short` is clean
after scan+extract.
```

## INV-2 — Deterministic material IDs (AT2)

```text
source_id, artifact_id, extraction_id, chunk_id are derived per IDS.md and exclude
wall-clock time. Deleting .dream/db/dream.sqlite and re-running scan+extract with
the same config reproduces identical source/artifact/chunk IDs.
Test: rebuild diff on the ID columns is empty.
```

## INV-3 — No claim without evidence (AT3)

```text
A claim is inserted only if it validates against schemas/claim.schema.json, which
requires source_chunks minItems 1, AND every source_chunk resolves to an existing
dm_chunks row (referential check). Empty/dangling evidence => reject, not store.
Test: claim with [] source_chunks is rejected; claim citing a missing chunk is
rejected.
```

## INV-4 — Referential evidence (AT13)

```text
Every ref in canonical_map.primary_sources, *.evidence[].ref, and claim.source_chunks
matches the IDS.md ref grammar AND resolves to a stored row at load time.
JSON Schema checks the prefix shape; the loader checks existence.
Test: a canonical map citing artifact:deadbeef that has no row fails validation.
```

## INV-5 — No semantic authority by display (AT4, DM-L9)

```text
Canonical maps emit status in {canonical, likely_canonical, contested, superseded,
unknown}. "canonical" (vs "likely_canonical") is permitted only when an admitted
Act (ref prefix act:) is among primary_sources. The UI/CLI never upgrades a
projection to truth.
Test: a map with no act: source cannot serialize status="canonical".
```

## INV-6 — External-model boundary (AT12, DM-L7)

```text
No corpus text leaves the process to an external provider unless
[run].external_model_allowed = true AND a run envelope authorizes it. The check
happens before any bytes are sent.
Test: with external_model_allowed=false, an external call is refused pre-send.
```

## Timestamp convention

```text
All STORED timestamps are UTC ISO-8601 with trailing Z (discovered_at, created_at,
generated_at, started_at, closed_at). Display and schedule cadence use
config.meta.timezone (Europe/Lisbon). `--since 24h` and recency scoring compute in
UTC. Mixed-tz comparison is a bug.
```
