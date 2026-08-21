# API — canonical Worker surface (v1.2)

The production API lives in `workers/api/` and follows Product Specification v1.2.

The write invariant is:

```text
proposal -> verify -> append -> route/evaluate -> effect
```

Semantic writes use **`POST /api/append`**. The canonical Worker surface does not expose
`POST /api/register`.

The installable Python package still contains an older local reference API in `lab/api.py`
for compatibility and conformance work. Do not use that reference surface as the contract
for the production Worker.

---

## Core invariants

### Complete authorship

A proposal contains all nine semantic LogLine slots plus AUX and envelope:

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

The backend verifies objective claims and shape. It does not fill missing semantic slots
or silently rewrite authored content.

### Receipt v1 identity

```text
content_hash  = H(JCS(LogLine 9 + AUX))
envelope_hash = H(JCS(envelope))
tuple_hash    = H(content_hash + envelope_hash)
```

`content_hash` is semantic identity. `tuple_hash` is occurrence identity.

### Process identity

For an `opened_process` Act:

- the opening `content_hash` is the process instance ID;
- the opening envelope has no self-referential process value;
- later Acts use `envelope.process = opening content_hash`;
- later Acts use `envelope.parent = previous tuple_hash`.

### Routing

Process routing consumes only the closed result set:

```text
ok | doubt | not
```

Nodes declare `responsible`, `if_ok`, `if_doubt`, and `if_not`.

---

## Canonical universal tools

The minimal Dream/runtime membrane is exactly:

```text
GET  /api/about
GET  /api/search
POST /api/append
```

### GET /api/about

Returns the ledger-native vocabulary/process context exposed to the authoring boundary.
Use this to ground a model or client before it authors an Act.

### GET /api/search

Query parameters:

- `q` or `query` — search text
- `limit` — requested result limit

Search returns ledger material suitable for grounding/citation rather than mutable process
state as authority.

### POST /api/append

Submits a complete authored proposal.

The Worker:

1. validates the proposal and objective invariants;
2. refuses invalid content before ledger mutation;
3. appends the verified receipt;
4. routes/evaluates only after append;
5. returns receipt identity and activation/current-work result.

Successful writes return HTTP `201`.

Typical receipt identity fields include:

```json
{
  "verified": true,
  "registered": true,
  "content_hash": "...",
  "envelope_hash": "...",
  "tuple_hash": "..."
}
```

A post-append runtime failure is reported distinctly from verification failure. If the Act
was durably appended, the response must not pretend it was never recorded.

---

## Process catalog and inspection

### GET /api/process-types

Returns process types discoverable by the current runtime. Canonical process law is a
ledger Act with `did: defined_process_type`.

Optional query:

```text
?query=...
```

### GET /api/process-types/{process_id}

Returns one process-type detail including citation/readiness information.

### POST /api/process-types

This is a **proposal/control-plane** route. It stores a process-type proposal; it does not
make the type law by itself.

A process becomes canonical law only when a valid `defined_process_type` Act is appended
to the ledger.

### GET /api/processes

Lists process instances derived from `opened_process` Acts and pure process replay.

### GET /api/cases/{hash}

Returns one ledger case/process timeline. For canonical process instances, the timeline is
built from the opening Act and descendants whose envelope binds to that instance.

The route accepts a 64-hex hash.

---

## Current work

### GET /api/now

Current human/runtime work derived from process replay plus active custody.

The view distinguishes:

- work needing a person/team;
- runtime work requiring operator attention;
- moving runtime work;
- recently closed process instances.

No mutable lifecycle helper Act outranks replayed process state.

### GET /api/pendencies

Returns active current-work items.

Optional filter:

```text
?resolved_by=user
?resolved_by=operator
```

Canonical process pendencies are custody items matched against the current process head.
Stale custody rows are not exposed as current truth.

---

## Vocabulary

### GET /api/vocabulary

Returns the current human-facing failure/action vocabulary exposed by the Worker.

The repository is in migration from a hardcoded compatibility catalog to fully
ledger-native vocabulary reads. Treat this route as presentation vocabulary, not process
truth.

---

## Grants and WebAuthn

The Worker exposes dedicated control-plane routes for authority/grant operations, including:

```text
GET  /api/grants
GET  /api/grants/{gid}
POST /api/grants
POST /api/grants/{gid}/revoke
POST /api/webauthn/enroll/options
POST /api/webauthn/enroll/verify
POST /api/webauthn/sign/options
POST /api/webauthn/sign/verify
```

Dangerous effects remain executor-governed. A model, router, or custody claim cannot bypass
required grant/signoff checks.

---

## Chat and model catalog

```text
POST /api/chat/turn
GET  /api/models
GET  /v1/models
```

Chat uses the same canonical universal membrane: `about`, `search`, `append`.
Model output does not receive authority from being model output.

---

## Candidates and projections

```text
GET /api/candidates
GET /api/projections
```

Candidates are proposals, not authority.

Projections are explicitly non-authoritative and rebuildable. They summarize ledger truth;
they do not replace it.

---

## Health and migration

### GET /api/health

Liveness/readiness information for the Worker and database surfaces.

The current health implementation still checks some compatibility tables while migration
continues. That does not make those tables canonical process truth.

### POST /api/migrate

Protected by `MIGRATE_TOKEN` / bearer token.

The current migration route still bootstraps legacy `process_contracts` and `runtime_queue`
structures before applying receipt/registry/process migrations. This is an explicit
compatibility seam scheduled for further isolation; it is not the architectural target.

---

## Error behavior

The kernel fails loud.

Clients should distinguish at least:

- malformed proposal / objective verification failure — no append;
- forbidden or invalid authority/grant/signoff — no unauthorized effect;
- database/schema unavailable — service failure;
- post-append activation/runtime unavailable — Act may already be durable and its receipt
  identity is returned.

Never silently repair authored semantics to make a request pass.

---

## Compatibility note

Historical Python/legacy code still contains:

- `/api/register`;
- `runtime_queue`;
- mutable `process_contracts`;
- selector/evaluator terminology.

Those exist for compatibility, historical reads, migration, and conformance. New Worker
clients should build against the v1.2 surface in this document.
