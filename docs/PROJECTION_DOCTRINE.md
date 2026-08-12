# PROJECTION DOCTRINE

This document belongs to the fresh Lab v0 documentation set. It preserves the root law: everything may register; only complete records matching registered process contracts activate.

See `GENESIS.md`, `processes/PROCESS_CATALOG.md`, and `LAB_TOPOLOGY.md` for the implemented baseline.

Projection world is not authority. Local projection documents are disposable read models derived from `logline_acts`; they may guide inspection, workbench views, and LLM context, but they cannot activate processes or create consequence.

Required projection metadata:

- `authoritative: false`
- `rebuildable: true`
- `sources: ["logline_acts"]`
- `input_hashes`
- `projection_spec_hash`
- `class: stable|dynamic`

Dynamic projections must also carry a pinned model/prompt/params/seed envelope, parent projection hashes, and a ladder level. Without that pin, the projection is refused rather than treated as truth.
