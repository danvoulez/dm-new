# Dream Machine Lab

A **processual, ledger-backed institutional runtime**.

The Lab turns authored proposals into governed consequence without letting models,
projections, queues, adapters, or convenience APIs silently become authority.

> **Author semantics first. Verify before append. Append before consequence. Fail loud.**

This repository follows **Product Specification v1.2**. The software release line remains
pre-1.0; this release is **v0.3.0**.

## The v1.2 spine

```text
proposal
  -> verify
  -> append
  -> route / evaluate
  -> effect
```

The order is load-bearing:

1. **Proposal** — an LLM, person, process activity, importer, or other caller authors a
   complete candidate Act.
2. **Verify** — the kernel checks objective claims and structural invariants. It does not
   invent missing semantics or silently repair authored content.
3. **Append** — the verified Act becomes immutable ledger memory.
4. **Route / evaluate** — deterministic process law decides whether the appended Act moves
   current work.
5. **Effect** — only then may a governed executor perform consequence.

A weird but objectively valid Act is allowed to exist even when it triggers nothing.
Validity and usefulness are different questions.

## The Act

A LogLine has exactly nine semantic slots:

```text
who
did
this
when
confirmed_by
if_ok
if_doubt
if_not
status
```

The author also supplies `AUX` and an `envelope`. In the Dream boundary, the model authors
all nine slots plus AUX and envelope. The backend verifies objective facts; it is not a
semantic co-author.

**Actor is not the same thing as scribe.** `who` describes the actor in the proposition.
The authenticated caller or model that wrote the record is a different fact.

## Receipt identity

Receipt v1 separates semantic identity, envelope identity, and occurrence identity:

```text
content_hash  = H(JCS(LogLine 9 + AUX))
envelope_hash = H(JCS(envelope))
tuple_hash    = H(content_hash + envelope_hash)
```

`content_hash` identifies semantic content. `tuple_hash` identifies the concrete ledger
occurrence, including process ancestry.

Older receipt-v0 records remain readable for compatibility; new canonical writes use the
v1 receipt model.

## Ledger-native process types

Process law is itself ledger data.

Bootstrap Acts:

```text
defined_vocabulary_term
defined_process_type
opened_process
```

A process type is authored as a `defined_process_type` Act. Runtime discovery reads the
ledger-native registry rather than treating mutable configuration as authority.

Legacy YAML and `process_contracts` remain compatibility/import seams while migration is
completed; they are not the canonical source of process truth.

## Process identity and ancestry

A process instance begins with an `opened_process` Act.

- the opening Act's `content_hash` is the **process instance identity**;
- the opening envelope does not self-reference the process;
- every later Act sets `envelope.process` to that opening `content_hash`;
- every later Act sets `envelope.parent` to the previous occurrence's `tuple_hash`.

That gives immutable, exact ancestry without a mutable process-state blob.

## Deterministic routing

Process nodes carry:

```text
activity
responsible
if_ok
if_doubt
if_not
```

The dispatch outcome is the closed set:

```text
ok | doubt | not
```

The router reads the current node and follows the matching branch. It does not reinterpret
or fabricate process semantics.

## Current work and custody

Current work is an ephemeral projection over the ledger, not authority.

A custody item is identified by:

```text
process_instance
node
responsible
source_tuple
status
```

Claims, leases, attempts, and retry metadata are runtime coordination state. They may be
reconstructed or discarded without changing ledger truth.

Human/team custody remains visible work. `runtime.executor` custody can be claimed by the
governed executor. Before acting, the executor re-projects the instance and refuses stale
work.

## Pure process state

`processCurrentState(instance)` is a pure projection of immutable Acts.

There is no authoritative mutable process blob. Current node, responsibility, openness,
and ancestry are replayed from the ledger.

## Dream / LLM membrane

The canonical minimal tool surface is exactly:

```text
about
search
append
```

`about` explains the available ledger/process vocabulary. `search` retrieves citable
ledger context. `append` submits a complete authored proposal through the canonical
verify-before-append path.

A model cannot give itself authority by emitting output. Model output remains authored
proposal material until ordinary process law and executor safety rules move it.

## Canonical HTTP surface

The production Worker API lives under `workers/api/`.

Core v1.2 routes:

```text
GET  /api/about
GET  /api/search?q=...
POST /api/append
GET  /api/process-types
GET  /api/processes
GET  /api/now
GET  /api/pendencies
GET  /api/cases/{hash}
```

`POST /api/register` is **not** part of the canonical Worker API. Semantic writes go
through `POST /api/append`.

Dedicated control-plane routes remain for grants, WebAuthn, migration, process-type
proposal/administration, chat, and explicit runtime advancement.

See [`docs/API.md`](docs/API.md) for the current Worker contract and
[`docs/UI_SPEC.md`](docs/UI_SPEC.md) for the human-interface rules.

### Python compatibility surface

The installable `dream-machine-lab` Python package still contains the earlier local
reference API/CLI and compatibility runtime used by Foundation, Dream, fleet, harness,
and migration tests. Some of that surface — including `lab/api.py` and older
selector/runtime-queue terminology — is deliberately retained for historical and
migration compatibility.

Do not use that compatibility API to infer the canonical v1.2 Worker write contract.

## Install the Python tooling

```bash
pip install dream-machine-lab
```

Optional WebAuthn verification:

```bash
pip install "dream-machine-lab[webauthn]"
```

From source:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[webauthn]"
```

## Verify the body

```bash
pytest -q
lab foundation suite
lab dream verify
lab harness
lab fleet audit --root fleet
```

Worker API:

```bash
cd workers/api
npm ci --legacy-peer-deps
npm run typecheck
npm test
```

UI:

```bash
cd ui
npm ci
npm run typecheck
npm test
npm run build
```

Build the Python artifact:

```bash
python -m build
```

The GitHub Actions **complete gate** runs all of the above classes of checks on pull
requests and on `main`.

## Authority, grants, and effects

Dangerous work is still governed by registered authority and grant structure. L4/L5 work
requires the appropriate grant and verified signoff. The executor, not the model or
router, owns effect-time safety checks.

Evidence obligations are checked before a governed activity is considered complete.
Unknown activities, invalid grants, missing evidence, stale custody, and broken process
ancestry fail loudly.

## Projections are not truth

Read models, UI summaries, search indexes, queues, and custody leases are projections or
runtime coordination aids. They can accelerate understanding and execution, but they do
not outrank the append-only ledger.

The canonical authority relationship is:

```text
LLM / person / activity authors semantics
                |
             verify
                |
        append-only ledger
                |
      deterministic process replay
                |
          custody projection
                |
       governed executor
                |
             effect
```

## Release migration notes: v0.2.x -> v0.3.0

- Use receipt v1 identity: `content_hash`, `envelope_hash`, `tuple_hash`.
- Do not treat `content_hash` alone as occurrence identity.
- Use `opened_process` content hash as the process instance ID.
- Use `envelope.parent` with the previous `tuple_hash`.
- Use the closed outcome set `ok | doubt | not`.
- Use node `responsible` and `if_ok` / `if_doubt` / `if_not`; legacy
  `sent_to` / `next_if_*` is not canonical.
- Use custody current work for canonical process execution.
- Use `POST /api/append` for semantic Worker writes; `/api/register` was removed from the
  canonical Worker surface.
- Keep old `runtime_queue`, mutable contract catalogs, and the Python reference API only as
  explicit migration/compatibility seams.

## Repository layout

| Path | Purpose |
|---|---|
| `workers/api/` | canonical v1.2 Worker API, verifier, routing, custody, executor |
| `ui/` | human interface consuming the Worker API |
| `migrations/` | PostgreSQL ledger, registry, receipt-v1, process and custody DDL |
| `schemas/` | canonical schemas, including LLM boundaries |
| `processes/` | seed/import compatibility process material |
| `lab/` | Python package, conformance tooling, compatibility runtime |
| `tests/fixtures/` | Foundation, Dream Machine, and Santo André conformance corpora |
| `docs/` | API, UI, operations, and design documentation |
| `.github/workflows/ci.yml` | complete release gate |

## Versioning

Two version axes coexist intentionally:

- **Product Specification v1.2** — the architectural/product canon this repository is
  converging on.
- **Software release v0.3.0** — the pre-1.0 package/repository release.

They are not interchangeable.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
