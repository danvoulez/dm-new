# Projections

Projections are non-authoritative, rebuildable views derived from `logline_acts`. If a projection disagrees with the ledger, the projection is wrong.

Implemented local projection commands:

- `lab project all`
- `lab project build <projection_spec>`
- `lab project inspect <projection_hash>`
- `lab project descend <projection_hash>`
- `lab project verify`

Every projection document must carry `authoritative:false`, `rebuildable:true`, `sources:["logline_acts"]`, and `input_hashes`. Stable projections are deterministic read models. Dynamic projections must include a `pin` with model, prompt, params, and seed, plus ladder metadata.
