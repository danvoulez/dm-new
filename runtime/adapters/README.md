# Adapters

Adapters are dumb leaves selected by process contracts and invoked by the executor. They return AUX fields for completion receipts; they do not own authority and do not write directly to the ledger.

Implemented v0 adapters:

- `receipt`: internal no-external-effect completion adapter.
- `projection`: records projection rebuild metadata with `authoritative=false` and `rebuildable=true`.
