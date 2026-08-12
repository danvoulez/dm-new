# API — what a user interface consumes

The runtime had no callable surface but the CLI and the Python API, so no interface
could exist. `lab/api.py` is that surface. Every example below is real output captured
from the running server, not illustration.

```bash
lab api serve                      # http://127.0.0.1:8787, writes enabled
lab api serve --read-only          # every write endpoint returns 403
lab api serve --port 9000 --host 0.0.0.0
```

The ledger comes from `LAB_DB` (default `.lab/lab.sqlite`), same as the CLI.

Zero pip dependencies — `http.server` and `json`, matching the kernel's promise. This is
a reference implementation for a local UI and for keeping this document honest. Put a
real server in front of it for anything beyond that.

---

## The two rules this surface is built on

**Registering is unconditional. Activating is not.**

`POST /api/register` always appends. It does not decide whether an arrival deserves to
exist — no layer gets to make that decision. It returns the receipt **and** the
activation verdict as two separate facts, so an interface can say *registered* and
*moving*, or *registered* and *waiting for X*, without ever fusing them into a single
success/failure boolean.

If your UI has a confirm button before something gets registered, the design has drifted.

**Reads cannot write.** Every read route goes through `lab.inspect` or plain `SELECT`s.
No verb on the read path can advance the ledger.

---

## Conventions

| | |
|---|---|
| Content type | `application/json; charset=utf-8` on every response, including errors |
| Interface language | pt-BR for anything a person reads; field names stay English |
| Hashes | full 64 hex in `*_hash` / `id`; `fingerprint` is the first 8, for display |
| CORS | `Access-Control-Allow-Origin: *`; the server binds to loopback by default |
| Errors | `{"error": "...", "code": "..."}` — codes: `no_route`, `method_not_allowed`, `bad_request`, `bad_json`, `not_found`, `lab_error`, `read_only` |
| `limit` | integer, clamped to 1..500 |

Never render a raw hash, a `did`, a `status`, or a doubt `code` to a person. Those are
wire values. `message`, `action`, `label`, and `title` are the human-facing fields.

---

## Endpoints by screen

| Screen | Endpoints |
|---|---|
| T0 Conversar · T2 Protocolar | `GET /api/process-types`, `POST /api/register` |
| T1 Agora | `GET /api/now` |
| T3 Pendências | `GET /api/pendencies`, `GET /api/vocabulary` |
| T4 O caso | `GET /api/cases/{hash}` |
| T5 Aprovar | `GET /api/grants`, `GET /api/grants/{id}`, `POST /api/grants`, `POST /api/grants/{id}/signoff`, `POST /api/grants/{id}/revoke` |
| T6 Propostas | `GET /api/candidates` |
| T7 Extratos | `GET /api/projections` |
| — | `GET /api/health`, `POST /api/advance` |

---

## GET /api/health

Liveness plus the shape of the runtime behind it. Useful as a boot check: if
`doubt_reasons` disagrees with the length of your rendered message table, the frontend
is out of date with the runtime.

```json
{
  "acts": 0,
  "adapters": ["inference", "oauth-client", "projection", "receipt"],
  "doubt_reasons": 27,
  "ledger": "logline_acts",
  "ok": true,
  "process_types": 11,
  "read_only": false
}
```

---

## GET /api/vocabulary

The complete failure vocabulary with its human messages. **Render from this rather than
hardcoding 27 strings** — adding a reason to the runtime then surfaces in the UI without
a frontend release.

```json
{
  "count": 27,
  "reasons": [
    {
      "code": "adapter_not_registered",
      "template": "A ação que este tipo pede ainda não existe neste sistema.",
      "action": "Avisar responsável",
      "resolved_by": "operator"
    }
  ]
}
```

`resolved_by` is `user` or `operator`, and it should change the tone, not just a badge:
15 of the 27 are things the person who filed the request can fix; 12 are configuration
only an operator can touch. Asking a user to fix `missing_network_policy` is cruel.

Templates carry `{campos}`, `{data}`, `{motivo}` placeholders. The server fills them —
you get finished sentences everywhere else in the API. This endpoint exposes the raw
templates only so a UI can show the catalog itself.

---

## GET /api/process-types

The catalog as a form generator sees it. `requires` and `accepts` come straight from the
contract, which is why **you never hand-write a form** — the contract is the form.

```json
{
  "accepts": [],
  "adapter": null,
  "danger_tier": "L0",
  "evidence_must_include": [],
  "irreversible": false,
  "needs_approval": false,
  "process_id": "attention-raise.v1",
  "readiness": "contract-only",
  "readiness_reason": "no adapter configured",
  "required_slots": ["who", "did", "this", "when", "confirmed_by", "if_ok", "if_doubt", "if_not", "status"],
  "requires": [],
  "runnable": false,
  "title": "attention-raise.v1"
}
```

| Field | Use |
|---|---|
| `title` | show this, never `process_id` |
| `requires` | the fields to ask for; the contract's own declaration |
| `accepts` | optional fields |
| `runnable` | if false, do not offer it — state it as a fact instead |
| `readiness` | `runnable` / `contract-only` / `blocked` / `not-runnable` |
| `needs_approval` | true for L4/L5 — say so before the person commits |
| `irreversible` | true for L5 only — this drives the *shape* of the approval screen |
| `danger_tier` | **effective** tier, already floored by the adapter's reach |

`danger_tier` is not merely what the contract declared. It is the stricter of the
declaration and the adapter's floor, so a contract cannot buy its way past the approval
path by declaring a low tier.

---

## POST /api/register

Register an arrival. Body is the act: the nine slots plus whatever domain fields the
contract declares. `when` defaults to now. `who` is required — an act is authored by
someone. `id` and `hashes` are ignored if sent; identity is computed from content.

**Registers and activates:**

```json
{
  "registered": true,
  "id": "df02dfc3bd274c73d4a7fdeb23153d8860eaeec03ed47d9868bc36dfffeaf259",
  "fingerprint": "df02dfc3",
  "activated": true,
  "process_id": "projection-build.v1",
  "danger_tier": "L1",
  "queued": true
}
```

**Registers and waits** — note `registered` is still `true`:

```json
{
  "registered": true,
  "id": "fdedf366cc60bf0fa88164d25ce2b684fa2b41417aead4d19011d220062f6830",
  "fingerprint": "fdedf366",
  "activated": false,
  "missing": [],
  "waiting": {
    "code": "no_adapter_configured",
    "message": "Este tipo existe, mas ainda não executa nada.",
    "action": "Avisar responsável",
    "resolved_by": "operator",
    "known": true
  }
}
```

The response also carries the full `receipt`. Show `fingerprint` — it is what gives a
person the physical sense that something was filed.

The selector runs either way, so an arrival that cannot move still leaves a durable
pendency. `waiting.code` is guaranteed to match the code that shows up in
`GET /api/pendencies` for the same arrival.

**UI rule:** never render this as success-or-error. It is always success. The second
fact is whether it moved.

---

## GET /api/now

The three questions the home screen answers, split by who can act.

```
{ "needs_you": [...], "needs_operator": [...], "moving": [...], "closed_today": [...] }
```

`needs_you` and `needs_operator` carry pendency objects (below). `moving` and
`closed_today` carry `{source_hash, fingerprint, process_id, when}`; `closed_today` adds
`result_hash`.

Do not show counts as a dashboard. If `needs_you` is empty, say *"Nada esperando por
você"* — an empty state is an answer, not a blank.

`closed_today` covers the last 24 hours.

---

## GET /api/pendencies

`?limit=` (default 50), `?resolved_by=user|operator`.

```json
{
  "action": "Avisar responsável",
  "code": "no_adapter_configured",
  "danger_tier": "L0",
  "fingerprint": "729ca875",
  "id": "729ca87593ed64b204b7194b4a40efd5903a125447db55fadae1a7d2cacc91a4",
  "known": true,
  "message": "Este tipo existe, mas ainda não executa nada.",
  "missing": [],
  "missing_evidence": [],
  "process_id": "attention-raise.v1",
  "resolved_by": "operator",
  "source_fingerprint": "fdedf366",
  "source_hash": "fdedf366cc60bf0fa88164d25ce2b684fa2b41417aead4d19011d220062f6830",
  "when": "2026-08-12T03:31:15.522695+00:00"
}
```

`message` is finished and interpolated — render it directly. `action` is the single
button. `missing` names the fields to ask for when `code` is `incomplete`; that case
resolves inline with another `POST /api/register`.

`known: false` means the runtime emitted a reason with no written message. It should
never happen — a test pins the catalog exhaustive against the runtime's vocabulary — but
handle it rather than crash.

`source_hash` links to `GET /api/cases/{hash}`.

---

## GET /api/cases/{hash}

One arrival and everything that descended from it. `{hash}` must be 64 hex characters;
anything else is a 404, not a 400.

```json
{
  "hash": "df02dfc3…",
  "fingerprint": "df02dfc3",
  "found": true,
  "valid": true,
  "slots": {"who": "dan", "did": "build_projection", "this": "lab", "…": "…"},
  "fields": {"projection_spec": "estado_do_lab"},
  "timeline": [
    {"step": "registered",  "label": "Registrado", "when": "…", "hash": "df02dfc3…", "fingerprint": "df02dfc3"},
    {"step": "queued",      "label": "Na fila",    "when": "…", "hash": "0b211c5e…", "fingerprint": "0b211c5e"},
    {"step": "dispatching", "label": "Executando", "when": "…", "hash": "5ce2e7b6…", "fingerprint": "5ce2e7b6"},
    {"step": "fechado",     "label": "Concluído",  "when": "…", "hash": "f3374d9a…", "fingerprint": "f3374d9a"}
  ],
  "came_from": [],
  "produced": [{"hash": "…", "fingerprint": "…", "did": "queued"}]
}
```

`label` is already in the interface's language — render it. `step` is the raw `did`, for
your own branching only.

A timeline entry that stopped also carries the pendency fields (`code`, `message`,
`action`, `resolved_by`), so the last line explains itself instead of vanishing.

`valid` is the receipt re-verified against its own content hash. `came_from` entries
carry `{hash, origin, resolves}` — `resolves: false` means the citation points outside
this ledger, so do not offer a dead link.

`fields` excludes the nine slots and receipt machinery, so it is exactly the domain data
a person recognises.

---

## GET /api/candidates

Proposals — model output and dream proposals. They are registered like everything else;
they simply have not been through the activation law.

`{id, fingerprint, did, when, schema_id, payload, citations, activates_process}`

`activates_process` is `false` by design. Giving a proposal a next step means registering
a new act that matches a type — which goes through `POST /api/register` like anything
else. Approving a proposal never executes it.

`citations` are content hashes the model cited from the context it was given; the runtime
already refused the output if any of them were not in that context, so they are safe to
render as links.

---

## GET /api/projections

```json
{
  "count": 1,
  "note": "Resumos reconstruíveis. Não são a fonte.",
  "projections": [{
    "projection_hash": "…", "fingerprint": "…", "spec": "estado_do_lab",
    "class": "stable", "computed_at": "…", "authoritative": false, "rebuildable": true
  }]
}
```

`authoritative: false` and `rebuildable: true` are invariants, not data — the store
refuses to persist a projection claiming otherwise. Surface the label permanently, not
as a dismissible hint.

---

## Grants — the approval surface

Authority and grants had no surface outside Python, which is why the approval screen had
nothing to call. Now they have both a CLI and these routes.

### GET /api/grants · GET /api/grants/{id}

Each grant comes with its live standing, because the grant record alone does not say
whether it is usable:

```
{ grant_id, fingerprint, process, adapter, granted_by, granted_to,
  valid_until, acu_limit, timeout_seconds, fs_scope, network_policy,
  revoked, expired, signed_off, signoff_reason, signer }
```

`signed_off` is the one that gates dangerous work. `signoff_reason` explains a `false`:
`grant_unsigned`, `signoff_signer_mismatch`, or `signature_layer_unavailable` — all three
are in the message catalog, so pass them through `GET /api/vocabulary` for the sentence.

`GET /api/grants/{id}` on an unknown id returns `{"grant_id": "…", "found": false}` with
status 200 — it is a valid answer about a grant that does not exist, not a transport
failure.

### POST /api/grants

Required: `process`, `granted_by`, `granted_to`. Optional: `adapter` (default `*`),
`valid_until`, `acu_limit`, `timeout_seconds`, `fs_scope`, `network_policy`
(`none` | `restricted` | `open`).

A grant without `valid_until`, `timeout_seconds`, `fs_scope`, or a valid
`network_policy` registers fine and then **never verifies** — the runtime rejects it at
use with `missing_grant_expiry`, `missing_timeout`, `missing_sandbox_scope`, or
`missing_network_policy`. Collect all four in the form, or the person will meet those
codes later without knowing why.

### POST /api/grants/{id}/signoff

`{signer, credential}` — `credential` is the WebAuthn assertion as JSON, with the grant's
content hash as the challenge. The signer must be the same identity as `granted_by`.

Without the `webauthn` extra installed, verification returns
`signature_layer_unavailable` and the work stays blocked. That is the intended
behaviour: the layer degrades honestly rather than faking success.

### POST /api/grants/{id}/revoke

`{revoked_by, reason}`. Append-only — revoking writes a record, it never deletes one.

---

## POST /api/advance

Runs one executor turn: `{"ran": true, "queue": {…}}` or `{"ran": false, "note": "nada na
fila"}`.

For a local UI so movement is visible without running a daemon. In a real deployment the
executor runs as a service and the interface never calls this.

---

## Not in this API, on purpose

`queue`, `receiver`, `clock`, `executor` internals, adapter names, raw ledger dumps.
They are runtime vocabulary; an interface that shows them has leaked the backend. The
queue is a projection of a decision, not a thing a person manages.

---

## Known gaps

- **No authentication.** `who` is taken from the request body. Put this behind a session
  layer that supplies the identity; do not let a browser assert `who` directly.
- **No ingress endpoint yet.** `schemas/llm/process_ingress.v1.json` and
  `prompts/process_ingress.v1.txt` ship here, and the governed inference path already
  compiles, validates, and registers. What is missing is the route that takes a sentence,
  runs that path, and registers the result — plus registering contracts as ledger records
  so a compilation can cite the version of the law it read.
- **No pagination cursors.** `limit` only. Fine at current scale, not forever.
- **`POST /api/advance` is a development convenience** and should be disabled in any
  deployment with a real executor.
