# LLM Receipt v1

The executor closes a governed inference with a canonical `logline.receipt.v0` whose `did` is `llm.receipt`.

Required inference evidence includes:

- `model_id`
- `model_called`
- `prompt_hash`
- `schema_id`
- `schema_hash`
- `input_hashes`
- `projection_hashes`
- `output_hash`
- `schema_valid`
- `citations_valid`
- `candidate_hashes` when candidate output is emitted

The model's output is never consequence. It is registered separately as a `candidate.inference_output` Act with `activates_process:false`; further movement requires normal evaluation/attention/process law.
