# ACTIVATION STATES

Fresh runtime states are explicit:

- `registered` / `sent`: memory exists, no consequence implied.
- `complete`: evaluator found all process-required slots and fields.
- `incomplete`: evaluator found missing slots/fields; the record freezes rather than executes.
- `queued`: activatable work is present in `runtime_queue`.
- `claimed`: executor has taken responsibility for one queue item.
- `closed`: executor wrote a completion receipt and closed the item.
- `failed`: adapter/dispatch failed and the queue item records the error.

Legacy status mappings remain documented in `LEGACY_STATUS_MAP.md`.
