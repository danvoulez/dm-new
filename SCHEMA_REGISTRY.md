# Schema Registry

Machine-readable LLM output schemas live under `schemas/llm/`.

| Schema ID | File | Purpose |
|---|---|---|
| `summary.v1` | `schemas/llm/summary.v1.json` | Summary + citations + optional requested action |
| `route_decision.v1` | `schemas/llm/route_decision.v1.json` | Schema-caged routing proposal |
| `process_ingress.v1` | `schemas/llm/process_ingress.v1.json` | Compiled ingress: one registered process type plus its domain fields |

The inference adapter loads the schema by registered ID, validates model JSON before closure, and turns invalid output into a durable `doubted` receipt. Schema validity does not make model output authoritative; valid output is still registered as a candidate Act.
