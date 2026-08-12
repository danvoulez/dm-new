# Model Registry

Status: operational registry contract for Lab v0.

The durable ledger may name a `model_id`, but it never carries executable model commands. Operator-controlled commands live in `.lab/models.json` (or `LAB_MODEL_REGISTRY`) and are registered with `lab model register`. This prevents an Act from turning model selection into arbitrary command execution.

Each registry entry records:

- `transport`: currently `command`;
- `command`: argv array executed with `shell=False`;
- `external`: whether the command crosses an external model boundary;
- `timeout_seconds`: bounded invocation time.

`external:true` models additionally require the inference Act to carry `allow_external_model:true`. The default is fail-closed.

The repository includes `tools/reference_model.py` only as a deterministic acceptance fixture. It is **not** presented as an LLM. Real deployments register an operator-owned local/runtime bridge (for example an Ollama, llama.cpp, or provider membrane command) under a stable `model_id`.
