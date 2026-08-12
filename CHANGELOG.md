# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Interface-enabling release: the runtime gains a callable surface, the dangerous-work path
gains a command surface, and five silent failures found by audit are fixed with tests.

### Added
- **HTTP API for a user interface** (`lab/api.py`, `lab api serve`) — stdlib only, so the
  kernel stays zero-dependency. Reads go through the read-only inspection layer; the one
  write that matters registers unconditionally and reports the activation verdict as a
  separate fact. Contract in `docs/API.md`.
- **Human message catalog** (`lab/messages.py`) — a written pt-BR sentence, one action,
  and a `resolved_by` audience for each of the 27 doubt reasons, served by
  `GET /api/vocabulary`. A test pins it exhaustive against `lab.runtime.DOUBT_REASONS`.
- **Authority and grant CLI** (`lab authority`, `lab grant`) — conceding, revoking,
  signing off, enrolling authenticators and reading live grant standing existed only as a
  Python API, which left the entire L4/L5 path unreachable from the shipped binary.
- **`process_ingress.v1`** — output schema and registered prompt for compiling an intent
  in prose into one registered process type plus its domain fields.
- **`docs/UI_SPEC.md`** — the interface specification the API serves.

### Fixed
- **Contract parser dropped block-style YAML sequences in silence.** A contract declaring
  required fields as a block list lost every one of them, so an act carrying none of them
  read as complete and activated — a fail-open in the activation law. Block sequences are
  now folded, trailing comments are stripped (`status: active  # note` used to parse as
  not-active), and any line the parser cannot model raises instead of being swallowed.
- **Only `*.v1.yml` contracts were loaded.** In a system whose contracts are versioned by
  name, every version after the first was invisible to the runtime.
- **`claim` did not check whether it won the queue race.** The `WHERE status = 'queued'`
  guard was the lock, but a worker that lost still received the row and would dispatch
  work another worker already owned.
- **The danger tier was pure declaration.** A contract naming a powerful adapter could
  declare `L0` and skip grant and signoff entirely, making contract authorship strictly
  more powerful than any grant. Adapters now carry a floor a contract cannot go under,
  and a test requires every registered adapter to declare one.

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
  proven byte-for-byte against the official conformance vectors. Replaces a
  `json.dumps(sort_keys=True)` that diverged on number formatting, integer domain, and
  UTF-16 key ordering.
- **Durable attention/doubt** — selectors (`receiver`, `clock`) now write an idempotent
  `doubt` receipt for an addressed-but-unfulfillable tap instead of dropping it silently.
- **Authority & grants (LAB FINAL SPEC §13)** — grants and authorities are registered
  append-only Acts (`lab/grants.py`, `lab/authority.py`); L4/L5 work resolves and verifies
  a grant rather than trusting self-asserted fields, with append-only revocation.
- **Passkey / WebAuthn signature binding** — the optional `[webauthn]` extra
  (`lab/signing/`) verifies a FIDO2 assertion over an Act's `content_hash`; attestation-
  verified enrollment; **all L4/L5 execution requires a verified passkey signoff**
  (fail-closed). The kernel stays zero-dependency and degrades honestly without the extra.
- **Evidence obligations enforced** — the executor verifies a contract's
  `evidence_must_include` against adapter output and writes `evidence_incomplete`
  instead of a fake `fechado` when evidence is missing.
- **RLS + function hardening** — migration `0003` restores RLS (service-role-only) and pins
  the mutation-trigger `search_path`, matching canon.
- **Packaging** — `[build-system]` (hatchling), full project metadata, Apache-2.0
  license, `README`, `SECURITY`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, CI, and issue/PR
  templates. The package is installable; `pip install dream-machine-lab[webauthn]` adds
  the crypto layer.

### Changed
- **Conformance corpora replace `fontes-dm.zip`** — the 16MB / 2466-entry source bundle is
  gone. The 92 files actually consumed are now clean, named fixtures under `tests/fixtures/`
  (`santo-andre-vectors/`, `dream-machine/`, `logline-foundation/`). The `harness`, `dream`,
  and `foundation` readers walk the filesystem; their CLI `--zip` flag is replaced by
  `--source` (defaulting to the fixture dir). CI now pins Node 20 for the Foundation
  reference verifier.

### Removed
- **`lab sources audit` / `lab/sources.py`** — the command existed only to audit the raw
  bundle that no longer exists.

[0.1.0]: https://github.com/danvoulez/dream-machine/releases/tag/v0.1.0

[0.2.0]: https://github.com/danvoulez/dream-machine/releases/tag/v0.2.0
