# LLM BUILDER PLAN

This document belongs to the fresh Lab v0 documentation set. It preserves the root law: everything may register; only complete records matching registered process contracts activate.

See `GENESIS.md`, `processes/PROCESS_CATALOG.md`, and `LAB_TOPOLOGY.md` for the implemented baseline.

LLM requests enter the Lab as candidate memory through `lab infer`. The command registers an inference request with model, prompt, schema, input hashes, projection hashes, and deterministic params; it does not call a model directly.

The runnable path is:

`lab infer` -> `lab queue add <hash> --process inference.v1 --adapter inference` -> `lab executor run`

The executor writes `processando`, dispatches the `inference` adapter, and closes with an `llm.receipt` Act. The local v0 adapter is dry-run only: `external_effect:false`, `model_called:false`, schema output validated, and any proposed output remains a candidate Act/attention object rather than direct consequence.

Fresh inference receipts must include:

- `did: llm.receipt`
- `status: fechado`
- `model_id`
- `prompt_hash`
- `schema_hash`
- `input_hashes`
- `projection_hashes`
- `output_hash`
- `schema_valid`
- `citations_valid`

LLM output may become candidate Acts, attention objects, dynamic projection rungs, summaries, or classifications. It may not execute code, send mail, call Devin, mutate canon, or treat projection data as authority.
