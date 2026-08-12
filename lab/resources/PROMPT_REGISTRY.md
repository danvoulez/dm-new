# Prompt Registry

| Prompt ID | Source | Purpose | Authority |
|---|---|---|---|
| `summarize.v1` | `prompts/summarize.v1.txt` | Produce a schema-caged summary with citations | proposal only |
| `route_inbound_event.v1` | operator/deployment supplied | Classify/route an inbound event | proposal only |
| `process_ingress.v1` | `prompts/process_ingress.v1.txt` | Compile an intent in prose into one registered process type plus its domain fields | proposal only |

Prompt identity is receipted through `prompt_id` and `prompt_hash`. A prompt never grants authority and cannot bypass process contracts, executor governance, or adapter controls.
