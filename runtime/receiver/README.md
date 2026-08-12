# Receiver Selector

Implemented by `lab.runtime.receiver_select` and exposed by `lab receiver <frequency>` / `lab mine <frequency>`.

Responsibilities:

- read canonical `if_ok` from `logline_acts`;
- evaluate addressed records against process contracts;
- write queued transition receipts for activatable records;
- keep queueing idempotent for `(source_hash, process_id, adapter)`;
- never call models, Devin, shell effects, or external notification adapters directly.
