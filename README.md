# Dream Machine Lab

A **processual, ledger-backed institutional runtime**.

The Lab exists to turn arrivals into governed consequence without letting memory,
projections, models, adapters, or selectors silently become authority.

> Everything may register. Only complete records matching registered process contracts activate.

An arrival is remembered first. The evaluator decides whether a registered process
contract permits movement. Selectors may queue work but cannot execute it. The executor
revalidates and governs dispatch. Adapters are leaves. Every transition is another
append-only receipt. Projections remain rebuildable. LLM and Dream Machine output remains
proposal/candidate material until ordinary process law moves it.

## What v0.2 does today

The shipped runtime closes the Lab v0 spine:

```text
register
  -> evaluate
  -> receiver/clock select
  -> rebuildable queue
  -> executor governs
  -> adapter acts
  -> evidence checked
  -> new closure receipt
  -> projection visible
```

It also supports a governed inference path:

```text
inference request
  -> executor
  -> operator-registered model command
  -> schema cage + citation check
  -> llm.receipt
  -> separate candidate Act
```

The model never receives authority from its output. A candidate cannot execute itself.

The package also contains the Dream Machine boundary, grant/authority controls for L4/L5,
WebAuthn fail-closed support, the three-machine fleet registry, Foundation conformance
corpora, Santo Andre pack vectors, migrations for `public.logline_acts`, and rebuildable
projection machinery.

## Install

```bash
pip install dream-machine-lab
```

Optional WebAuthn verification:

```bash
pip install "dream-machine-lab[webauthn]"
```

The wheel contains the runtime resources used by the CLI, so the conformance, Dream, fleet,
and schema commands work **outside a source checkout**.

From source:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Verify the installed body

```bash
lab doctor
lab foundation suite
lab harness
lab dream verify
lab fleet audit
```

`lab foundation suite` runs the upstream Node verifier over the packaged Foundation corpus.

## First alive loop

Use a disposable ledger while learning:

```bash
export LAB_DB="$PWD/lab-demo.sqlite"

lab register \
  --who human \
  --did build_projection \
  --this lab \
  --confirmed_by human \
  --if_ok projection-build.v1 \
  --if_doubt attention-raise.v1 \
  --if_not stop \
  --status registered \
  --data '{"projection_spec":"my_lab_state"}'

lab receiver projection-build.v1
lab executor run
lab project verify
```

The projection adapter does not write state itself. It returns a projection request; the
governed executor materializes the non-authoritative projection and records its hash in the
closure receipt.

## Real model boundary

Model commands are **operator configuration**, not receipt content. An Act may name a
`model_id`; it cannot inject an executable command.

Register a local model/membrane command:

```bash
lab model register my-local-model \
  --command-json '["/absolute/path/to/model-bridge"]'
```

Then register an inference request:

```bash
lab infer summarize \
  --model my-local-model \
  --schema summary.v1 \
  --real-model \
  --prompt-id summarize.v1 \
  --input-json '{"message":"summarize this"}'
```

The request is memory only until it moves through the normal runtime:

```bash
lab queue add <REQUEST_HASH> --process inference.v1 --adapter inference
lab executor run
```

A successful real invocation closes with an `llm.receipt` and registers the model output as
a **separate `candidate.inference_output` Act**. Invalid JSON/schema/citations become a
durable doubt rather than disappearing or silently executing.

External model bridges may be registered with `lab model register --external`; those calls
fail closed unless the inference request explicitly carries `--allow-external-model`.

`tools/reference_model.py` is only a deterministic acceptance fixture. It is not presented
as an LLM.

## Release acceptance

From the source release:

```bash
scripts/acceptance.sh
```

This runs the public CLI through Foundation conformance, pack harness, Dream boundary, fleet
audit, a real projection materialization, a real subprocess-model invocation, schema
validation, separate candidate registration, and package-resource provenance verification.

For a built wheel:

```bash
scripts/installed-smoke.sh dist/dream_machine_lab-0.2.0-py3-none-any.whl
```

That creates a clean virtualenv in a temporary directory, installs only the wheel, changes
out of the repository, and repeats the installed runtime flow.

## User interface surface

The runtime had no callable surface but the CLI and the Python API, so no interface could
exist. `lab api serve` is that surface — stdlib only, keeping the zero-dependency promise.

```bash
lab api serve                 # http://127.0.0.1:8787
lab api serve --read-only     # every write endpoint returns 403
```

Registering is unconditional; activating is not. `POST /api/register` always appends and
returns the receipt *and* the activation verdict as two separate facts, so an interface
can say "registered" and "moving" — or "registered" and "waiting for X" — without ever
fusing them into one success/failure boolean.

The failure vocabulary is closed (27 reasons), and `lab/messages.py` carries a written
pt-BR sentence and one action for each, served by `GET /api/vocabulary`. A test pins the
catalog exhaustive against the runtime, so "never a generic error" survives contact with
future changes.

See [`docs/API.md`](docs/API.md) for the endpoint contract and
[`docs/UI_SPEC.md`](docs/UI_SPEC.md) for the interface specification it serves.

## Authority and grants from the CLI

L4/L5 work needs a registered grant plus a verified passkey signoff. Both now have a
command surface:

```bash
lab authority genesis dan@example.com
lab authority enroll-authenticator dan@example.com --credential-id ... --public-key ... \
    --rp-id example.com --origin https://example.com --by dan@example.com
lab grant register --process worker-run.v1 --granted-by dan@example.com \
    --granted-to marina --valid-until 2027-01-01T00:00:00Z --acu-limit 5 \
    --timeout 60 --fs-scope /Lab/work --network-policy restricted
lab grant signoff <GRANT_ID> --signer dan@example.com --credential "$ASSERTION_JSON"
lab grant show <GRANT_ID>
```

`lab grant show` reports live standing — revoked, expired, signed off — because the grant
record alone does not say whether it is usable.

## Architecture

```text
arrival -> logline_acts (memory / authority)
                |
             evaluate
                |
       receiver / clock          selectors only
                |
       runtime_queue             disposable projection
                |
             executor            governed dispatcher
                |
             adapter             dumb leaf
                |
     evidence + new receipt
                |
           projections           non-authoritative, rebuildable
```

### Load-bearing invariants

- **Receipt mold** (`lab/receipt.py`): nine canonical string slots; `transport`, `result`, and
  `evidence` forbidden at rest; RFC 8785 canonical bytes; `id` is the content hash.
- **Append-only ledger** (`lab/store.py`, `migrations/`): generated slot/AUX columns and
  blocked update/delete paths.
- **Selectors do not execute** (`lab/runtime.py`): receiver and clock select/queue only.
- **Executor governs consequence**: it re-evaluates before dispatch, materializes adapter
  outputs, enforces evidence, and writes closure/doubt receipts.
- **Authority is registered structure** (`lab/authority.py`, `lab/grants.py`): L4/L5 work
  requires grants and verified passkey signoff.
- **Projections are not truth** (`lab/projections.py`): rebuildable read models with input
  hashes; dynamic projections require pinned model/prompt/params/seed metadata.
- **Models propose** (`lab/inference.py`): model output is schema-caged and emitted as a
  candidate; it cannot create direct consequence.
- **Packaged resources have provenance**: `tools/sync_package_resources.py` produces the
  wheel mirror and `lab/resources/MANIFEST.json` records source path, size, and SHA-256 for
  every copied runtime resource.

## Repository layout

| Path | Purpose |
|---|---|
| `lab/` | runtime kernel and CLI |
| `processes/` | process contracts and generated catalogs |
| `migrations/` | PostgreSQL/Supabase canonical ledger DDL |
| `schemas/llm/` | inference output schemas |
| `prompts/` | registered prompt sources |
| `fleet/` | three-machine body + resident service allowlist |
| `tests/fixtures/` | Foundation, Dream Machine, and Santo Andre conformance corpora |
| `lab/resources/` | generated release mirror with SHA-256 manifest |
| `scripts/acceptance.sh` | source-level end-to-end release acceptance |
| `scripts/installed-smoke.sh` | clean-wheel installation and behavior smoke |

See `LAB FINAL SPEC v0.md` and `LAB FINAL IMPLEMENTATION SPEC v0.md` for the canon this
release implements.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
