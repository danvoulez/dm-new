#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python}"
LAB=("$PYTHON_BIN" -m lab.cli)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export LAB_DB="$TMP/lab.sqlite"
export LAB_MODEL_REGISTRY="$TMP/models.json"
cd "$ROOT"

"$PYTHON_BIN" tools/verify_package_resources.py > "$TMP/resources.json"
"${LAB[@]}" foundation suite > "$TMP/foundation.json"
"${LAB[@]}" harness > "$TMP/harness.json"
"${LAB[@]}" dream verify > "$TMP/dream.json"
"${LAB[@]}" fleet audit --root fleet > "$TMP/fleet.json"

"${LAB[@]}" model register reference-model \
  --command-json "[\"$(command -v "$PYTHON_BIN")\",\"$ROOT/tools/reference_model.py\"]" \
  > "$TMP/model.json"

# Alive loop A: arrival -> contract -> selector -> queue -> executor -> projection -> closure.
REQ=$("${LAB[@]}" register \
  --who acceptance-human --did build_projection --this lab-v0 \
  --confirmed_by acceptance-human --if_ok projection-build.v1 \
  --if_doubt attention-raise.v1 --if_not stop --status registered \
  --data '{"projection_spec":"acceptance_state"}')
REQ_HASH=$(printf '%s' "$REQ" | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["id"])')
"${LAB[@]}" receiver projection-build.v1 > "$TMP/receiver.json"
CLOSED=$("${LAB[@]}" executor run)
RESULT_HASH=$(printf '%s' "$CLOSED" | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["result_hash"])')
PROJ_HASH=$("${LAB[@]}" inspect "$RESULT_HASH" | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["projection_hashes"][0])')
"${LAB[@]}" project inspect "$PROJ_HASH" > "$TMP/projection.json"

# Alive loop C: governed model call -> schema cage -> LLM receipt -> separate candidate Act.
INF=$("${LAB[@]}" infer summarize --model reference-model --schema summary.v1 --real-model \
  --prompt-id summarize.v1 \
  --prompt-text 'Summarize the registered input without creating consequence.' \
  --input-json '{"message":"the Lab is alive"}' \
  --input-hash "$REQ_HASH")
INF_HASH=$(printf '%s' "$INF" | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["id"])')
"${LAB[@]}" queue add "$INF_HASH" --process inference.v1 --adapter inference > "$TMP/inference-queue.json"
INF_CLOSED=$("${LAB[@]}" executor run)
INF_RESULT=$(printf '%s' "$INF_CLOSED" | "$PYTHON_BIN" -c 'import json,sys; print(json.load(sys.stdin)["result_hash"])')
"${LAB[@]}" inspect "$INF_RESULT" > "$TMP/inference-result.json"
CANDIDATE_HASH=$("$PYTHON_BIN" -c 'import json,sys; print(json.load(open(sys.argv[1]))["candidate_hashes"][0])' "$TMP/inference-result.json")
"${LAB[@]}" inspect "$CANDIDATE_HASH" > "$TMP/candidate.json"
"${LAB[@]}" project verify > "$TMP/project-verify.json"

"$PYTHON_BIN" - "$TMP" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1])
def load(name): return json.load(open(p/name, encoding='utf-8'))
checks={
    'resource_provenance': load('resources.json').get('ok') is True,
    'foundation_conformance': load('foundation.json').get('ok') is True,
    'pack_harness': load('harness.json').get('ok') is True,
    'dream_machine_boundary': load('dream.json').get('ok') is True,
    'three_machine_body': load('fleet.json').get('ok') is True and load('fleet.json').get('machine_count') == 3,
    'projection_visible': load('projection.json').get('projection_spec') == 'acceptance_state' and load('projection.json').get('authoritative') is False,
    'projection_store_valid': load('project-verify.json').get('ok') is True,
    'model_really_called': load('inference-result.json').get('model_called') is True,
    'model_schema_valid': load('inference-result.json').get('schema_valid') is True,
    'candidate_separate_receipt': load('candidate.json').get('did') == 'candidate.inference_output',
    'candidate_non_authoritative': load('candidate.json').get('activates_process') is False,
}
result={'ok': all(checks.values()), 'checks': checks}
print(json.dumps(result, indent=2, sort_keys=True))
raise SystemExit(0 if result['ok'] else 1)
PY
