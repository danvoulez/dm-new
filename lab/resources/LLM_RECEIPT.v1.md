# LLM Receipt v1

The executor closes a governed inference with a canonical `logline.receipt.v1` whose `did` is `llm.receipt`.

Receipt identity follows the product v1.2 split:

- `content_hash = H(JCS(LogLine 9 fields + AUX))`
- `envelope_hash = H(JCS(envelope))`
- `tuple_hash = H(content_hash + envelope_hash)`

`content_hash` names the semantic Act. `tuple_hash` names that Act in its exact process/runtime envelope. A governed inference result therefore keeps semantic evidence in AUX and custody/process context in the envelope rather than mixing the two identity domains.

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

The model's output is never consequence. It is registered separately as a `candidate.inference_output` Act with `activates_process:false`; further movement requires normal verification, append, and process routing.
