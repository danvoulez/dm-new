# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-08-21

Product-spec v1.2 architecture release. This release moves the canonical Worker runtime
from append-first contract activation toward a strict verify-before-append ledger kernel,
ledger-native process law, immutable process ancestry, deterministic custody routing, and
governed execution.

### Added
- **Receipt v1 identity** — semantic `content_hash`, separate `envelope_hash`, and
  occurrence `tuple_hash`, with receipt-v0 compatibility retained for historical reads.
- **Ledger-native registries** — `defined_vocabulary_term`, `defined_process_type`, and
  `opened_process` bootstrap Acts plus current ledger views for process types and
  vocabulary.
- **Process instance identity** — an `opened_process` content hash is the immutable process
  instance ID; descendants bind `envelope.process` to that ID and `envelope.parent` to the
  previous occurrence `tuple_hash`.
- **Pure process replay** — `processCurrentState` derives current node, responsibility,
  ancestry, and closure from immutable Acts rather than an authoritative mutable process
  blob.
- **Deterministic custody routing** — process nodes use `responsible` and
  `if_ok`/`if_doubt`/`if_not`, with the exact closed dispatch outcome set
  `ok | doubt | not`.
- **Custody current-work projection** — ephemeral queue rows identify current work by
  process instance, node, responsible party, and source tuple; leases and claims remain
  runtime coordination state rather than ledger truth.
- **Custody executor** — atomic lease claiming, stale-head revalidation, immutable
  activity lookup, danger/grant enforcement, evidence obligations, fail-loud unknown
  activities, and canonical append-through-routing after effects.
- **Canonical universal tools** — the Dream/runtime membrane is exactly `about`, `search`,
  and `append`.
- **Canonical Worker reads** — process-aware `/api/processes`, `/api/now`,
  `/api/pendencies`, and `/api/cases/{hash}` use process replay and current custody.
- **Callable UI and approval surfaces** — HTTP/UI, grants, WebAuthn, model catalog,
  candidate, and projection routes shipped during the 0.2→0.3 development line.

### Changed
- **Verification now precedes append.** The canonical path is
  `proposal → verify → append → route/evaluate → effect`; invalid proposals fail before
  ledger mutation.
- **Semantic authorship belongs to the authoring boundary.** Dream authors all nine
  LogLine slots plus AUX and envelope. The backend verifies objective claims and does not
  silently fill missing semantics.
- **Actor and scribe are separate concepts.** Authenticated caller identity no longer
  substitutes for the semantic actor named in `who`.
- **Process law moved into the ledger.** YAML/process-contract tables remain migration
  compatibility seams instead of canonical mutable truth.
- **Santo André vectors moved to custody semantics.** Legacy `sent_to` and `next_if_*`
  transport fields were replaced by node `responsible` and `if_*` branches.
- **Runtime execution prefers canonical custody.** Legacy `runtime_queue` execution is
  isolated behind an explicit compatibility module and only applies when canonical custody
  does not own the work.
- **UI write terminology changed from register to append.** Chat actions and the UI client
  now use `confirm_append` / `append_body` and `POST /api/append`.
- **Package metadata now points at `danvoulez/dm-new`.** The Python package version is
  `0.3.0`; Product Specification v1.2 remains a separate version axis.

### Removed
- **Raw `POST /api/register` from the canonical Worker API.** Semantic Worker writes go
  through strict `POST /api/append`.
- **Legacy runtime seams from canonical runtime projections.** `runtime_queue`, lifecycle
  helper Acts, and mutable process-contract joins no longer define canonical process
  state; remaining use is quarantined for historical/unmigrated compatibility.

### Migration notes
- Treat `content_hash` as semantic identity and `tuple_hash` as concrete occurrence
  identity.
- Set `envelope.process` to the opening `opened_process` content hash for descendant Acts.
- Set `envelope.parent` to the previous occurrence `tuple_hash`.
- Use only `ok`, `doubt`, or `not` as dispatch outcomes.
- Replace legacy `sent_to` / `next_if_*` process transport with
  `responsible` / `if_ok` / `if_doubt` / `if_not`.
- Use `POST /api/append` for canonical Worker semantic writes.
- The local Python reference API and older queue/contract machinery remain explicit
  compatibility surfaces and should not be used as the v1.2 Worker contract.

## [0.2.0] — 2026-08-12

Lab v0 closure release: the documented alive loops now perform their advertised work and
the built wheel is self-contained outside a source checkout.

### Added
- **Real governed model boundary** — operator-controlled model registry (`lab model`),
  shell-free command invocation, external-boundary opt-in, schema validation, citation
  validation, and durable doubt on adapter/model refusal.
- **Separate candidate registration** — inference output is appended as its own
  `candidate.inference_output` receipt; the `llm.receipt` records candidate hashes.
- **Real projection materialization** — `projection-build.v1` now produces a stored,
  rebuildable, non-authoritative projection through executor-governed materialization.
- **Required LLM registries** — model, prompt, schema, and LLM receipt registries plus
  machine-readable `schemas/llm/`.
- **Self-contained wheel resources** — process contracts, fleet, migrations, schemas,
  prompts, and conformance corpora ship under `lab/resources/` with a source/size/SHA-256
  manifest.
- **Release acceptance scripts** — public-CLI end-to-end acceptance and clean-wheel smoke
  installation outside the repository.

### Fixed
- `lab inspect` is now a read-only superset of the receipt, preserving inspection metadata
  while exposing receipt fields directly for CLI consumers.
- Packaging no longer claims source-checkout-only resources as installed functionality.
- The project now builds with the standard setuptools PEP 517 backend used by the release
  validation environment.

## [0.1.0] — 2026-06-22

First release: a processual, ledger-backed runtime — append-only ledger, receipt mold,
evaluator, queue, selector/executor split, projection doctrine, and the Dream Machine
boundary, with the determinism and authority guarantees below.

### Added
- **Realtime delivery** — migration `0002_realtime_publication.sql` enables
  `public.logline_acts` in the `supabase_realtime` publication; a runnable WebSocket
  receiver under `runtime/receiver/` (the row is the durable event, realtime is the bell).
- **True RFC 8785 (JCS) canonicalization** — receipt hashing now uses the vendored
  Trail of Bits reference implementation (`lab/_vendor/rfc8785/`, zero-dependency),
  proven byte-for-byte against the official conformance vectors.
- **Durable attention/doubt** — selectors (`receiver`, `clock`) now write an idempotent
  `doubt` receipt for an addressed-but-unfulfillable tap instead of dropping it silently.
- **Authority & grants** — grants and authorities are registered append-only Acts; L4/L5
  work resolves and verifies a grant rather than trusting self-asserted fields.
- **Passkey / WebAuthn signature binding** — optional `[webauthn]` verification binds
  signoff to an Act's `content_hash`; L4/L5 execution fails closed without valid signoff.
- **Evidence obligations enforced** — the executor verifies declared evidence before
  closure.
- **Packaging** — project metadata, Apache-2.0 licensing, CI, package resources, and
  contribution/security documents.

[0.1.0]: https://github.com/danvoulez/dm-new/releases/tag/v0.1.0
[0.2.0]: https://github.com/danvoulez/dm-new/releases/tag/v0.2.0
[0.3.0]: https://github.com/danvoulez/dm-new/releases/tag/v0.3.0
