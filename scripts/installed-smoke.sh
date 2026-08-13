#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then echo "usage: $0 WHEEL" >&2; exit 2; fi
WHEEL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
python -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install --no-index "$WHEEL" >/dev/null
RUN="$TMP/run"; mkdir -p "$RUN"; cd "$RUN"
export LAB_DB="$RUN/lab.sqlite"
export LAB_MODEL_REGISTRY="$RUN/models.json"
LAB="$TMP/venv/bin/lab"
PY="$TMP/venv/bin/python"
"$LAB" doctor > doctor.json
"$LAB" foundation suite > foundation.json
"$LAB" harness > harness.json
"$LAB" dream verify > dream.json
"$LAB" fleet audit > fleet.json
cat > model.py <<'PY'
import json,sys
r=json.load(sys.stdin)
json.dump({'summary':'installed model: '+str(r.get('input')),'citations':r.get('input_hashes',[])+r.get('projection_hashes',[]),'requested_action':'register_candidate'},sys.stdout)
PY
"$LAB" model register installed-model --command-json "[\"$PY\",\"$RUN/model.py\"]" >/dev/null
REQ=$("$LAB" register --who human --did build_projection --this installed --confirmed_by human --if_ok projection-build.v1 --if_doubt attention-raise.v1 --if_not stop --status registered --data '{"projection_spec":"installed_state"}')
REQ_HASH=$(printf '%s' "$REQ" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["id"])')
"$LAB" receiver projection-build.v1 >/dev/null
C=$($LAB executor run)
RH=$(printf '%s' "$C" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["result_hash"])')
PH=$($LAB inspect "$RH" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["projection_hashes"][0])')
"$LAB" project inspect "$PH" > projection.json
I=$($LAB infer summarize --model installed-model --schema summary.v1 --real-model --input-json '{"message":"wheel"}' --input-hash "$REQ_HASH")
IH=$(printf '%s' "$I" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["id"])')
"$LAB" queue add "$IH" --process inference.v1 --adapter inference >/dev/null
IC=$($LAB executor run)
IR=$(printf '%s' "$IC" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["result_hash"])')
"$LAB" inspect "$IR" > inference.json
"$PY" - <<'PY'
import json
checks={
 'foundation': json.load(open('foundation.json'))['ok'],
 'harness': json.load(open('harness.json'))['ok'],
 'dream': json.load(open('dream.json'))['ok'],
 'fleet': json.load(open('fleet.json'))['ok'],
 'projection': json.load(open('projection.json'))['projection_spec']=='installed_state',
 'model_called': json.load(open('inference.json'))['model_called'] is True,
 'candidate': bool(json.load(open('inference.json')).get('candidate_hashes')),
}
print(json.dumps({'ok':all(checks.values()),'checks':checks},indent=2,sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 1)
PY
