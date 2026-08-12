# Dream Machine Acceptance Tests

## AT1 — No source mutation

Given a repo, when `dream scan` and `dream extract` run, then no source files outside `.dream/` change.

## AT2 — Rebuildable material DB

Given `.dream/db/dream.sqlite` is deleted, when scan/extract are rerun with same config, then source/artifact/chunk IDs match.

## AT3 — No claim without evidence

Given an LLM returns a claim without `source_chunks`, validation rejects it.

## AT4 — Material is not truth

Given a canonical map selects a doc as likely canonical, output must say `likely_canonical` or `canonicality projection`; it must not say admitted truth unless an admitted Act is cited.

## AT5 — Contradiction is not resolved silently

Given two claims conflict, Dream Machine must report contested/unknown unless evidence of supersession exists.

## AT6 — Stale doc detection

Given a doc claims a command exists but package/Makefile/Cargo does not contain it, drift audit marks it stale/unknown, not verified.

## AT7 — UI duplicate detection

Given two screenshots with same visible content and different paths, UI lineage groups them as duplicates with confidence.

## AT8 — Simulation is not policy

Given simulation flags a change as dangerous, it must produce risk finding/candidate, not enforce blacklist.

## AT9 — Patch proposal is candidate material

Given a generated patch, output includes tests, rollback, evidence, and does not apply unless explicit mode is requested.

## AT10 — Ask includes unknowns

Given insufficient evidence, `dream ask` must answer with unknowns/next evidence step, not hallucinated certainty.

## AT11 — Secret redaction

Given file contains token-like material, scanner flags/excludes/redacts before embeddings.

## AT12 — External model boundary

Given policy forbids external upload, any LLM call using external provider is rejected before sending corpus text.

## AT13 — Canonical map cites sources

Every primary source in canonicality output must resolve to source/chunk/artifact ID.

## AT14 — Drift produces Ghost candidate path

Unresolved drift can produce `opened_drift_ghost.candidate.act.json`, but never admitted Act.

## AT15 — Morning brief compression

Given multiple agent/run outputs, morning brief must group by topic, contradictions, decisions, and blocked items, not dump raw logs.
