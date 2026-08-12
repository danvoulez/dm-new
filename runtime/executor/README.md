# Executor Dispatcher

Implemented by `lab.runtime.executor_run_once` and exposed by `lab executor run`.

Responsibilities:

- refuse dispatch while the executor service is paused;
- claim one queued item atomically;
- dispatch through the adapter named by the queue item;
- require the adapter to return evidence/result AUX only;
- write a separate completion receipt;
- close the queue item only after that completion receipt exists;
- mark the queue item failed if the adapter path raises.

The executor is generic. Devin, GitHub, notification, worker, projection, and inference paths must be adapters behind this dispatcher rather than direct receiver/clock effects.
