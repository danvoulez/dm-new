# Dream implementation notes

Implementation aligned to **Spec de Implementacao - Dream (DM Lab), v1.0**.

## Implemented in this cut

- **Fase 0 / higiene**
  - public routes no longer return fake-success stubs;
  - chat composer moved back into normal layout flow;
  - dead search/attachment/edit controls removed;
  - pendency sheet remounts per item;
  - case links use the full content hash.

- **Fase 1 / pipeline real**
  - JCS-compatible receipt minting in the Worker with Python kernel parity;
  - Postgres-backed reads for now, pendencies, cases, process types, candidates, grants, and process list;
  - TypeScript port of `evaluate` and `receiver_select`;
  - durable, rebuildable runtime queue with real `queued`/stop receipts;
  - real register/advance paths;
  - append-only grant create/revoke/standing;
  - `process_contracts` and `runtime_queue` migrations plus seeded contracts;
  - generic `/api/register` rejects control-plane DIDs so authority/grant/passkey receipts can only be minted by validated server flows.

- **Fase 2 / passkey**
  - WebAuthn enrollment options/verify;
  - grant-bound sign options/verify;
  - 5-minute, single-use D1 challenges; deterministic grant challenges are never resurrected after consumption;
  - RP/origin/user-verification/sign-counter validation, with an explicit regression guard before counter append;
  - verified signoff is appended to the ledger and only then can eligible stopped work be requeued;
  - browser uses the native WebAuthn ceremony instead of demo credentials.

- **Fase 3 / agente**
  - `/api/chat/turn` with server-built context, one tool call per turn, deterministic temperature, tool whitelist, and schema-validated response;
  - agent prepares registrations, grants, type proposals, status reads, stop explanations, passkey requests, and projection reads without direct ledger access;
  - confirmations remain server-side writes through validated endpoints;
  - model output is sanitized before reaching the UI so technical IDs, hashes, JSON, readiness, and L-tiers are not surfaced as prose;
  - D1 chat history is a non-authoritative conversational projection.

- **Fase 4 / Dream UI**
  - final menu: Pendencias, Todos os processos, Tipos de processo, Regras, plus Novo;
  - chat-first Home using `/api/chat/turn` and one live action card;
  - real Todos os processos page derived from the ledger;
  - humanized process titles, narrative case timeline, technical metadata behind `... detalhes`;
  - centralized risk presentation;
  - Regras combines live grants and process risk;
  - legacy routes redirect to the new information architecture.

## Intentionally not implemented

- **Fase 5 identity/session**. The lab identity remains explicit until a real session/OAuth layer is chosen, as specified.
- Execution adapters other than the Worker `receipt` adapter. Contracts depending on unported adapters are reported as not currently executable rather than being faked.

## Validation run in this environment

- Python kernel: `348 passed, 1 skipped`.
- Worker unit/regression suite: receipt parity, control-plane membrane, grant safety-field policy, WebAuthn grant challenge + replay guard + sign-counter regression guard, chat-core validation, readiness, migrations/public routes, and evaluator parity all pass.
- Cross-language evaluator parity: 7 kernel vectors match TypeScript verdicts.
- Worker strict TypeScript harness passes with external runtime modules stubbed to their used interfaces.
- UI F4 source-surface guard passes.
- All active UI TypeScript/TSX sources transpile without syntax diagnostics.
- JSON schemas/package files parse successfully.

## Environment limitation before deploy

A full fresh dependency install and real `npm run typecheck`/Vitest run could not be completed here because package-registry access is unavailable. The uploaded repository also already contains a Wrangler peer mismatch between its locked Wrangler and `@cloudflare/workers-types`; the same `npm ls --package-lock-only --all` failure reproduces on the untouched original tree. Resolve/update that dependency pair in a networked checkout before using the zero-warning deploy gate.

## Migrations

Postgres, in order:

1. `migrations/0001_logline_acts.sql`
2. `migrations/0002_realtime_publication.sql`
3. `migrations/0003_rls_and_search_path.sql`
4. `migrations/0004_process_contracts.sql`
5. `migrations/0005_runtime_queue.sql`

D1 migrations are applied from `workers/api/migrations/`, including WebAuthn challenges and chat turns.

## Checkpoint v4 — register DoD + WebAuthn assertion envelope

- Extracted `workers/api/src/register-flow.ts` so the authoritative append -> evaluate -> receiver-select pipeline is directly testable.
- Added `tests/register-flow.mjs` covering the literal F1 cases: `memory-register.v1` activates/queues, and an incomplete receipt returns a canonical vocabulary-backed waiting message naming the missing slot.
- Fixed waiting-message rendering: empty `missing_aux` no longer masks a non-empty `missing_slots` list.
- Added `RegisterActivationError` so any failure after a successful append preserves the registered receipt id/fingerprint and reports activation unavailable, maintaining `registered != activated` without regex-based stage guessing.
- Added pure WebAuthn assertion-envelope validation in `webauthn-challenge.ts`; tampered grant challenge, malformed clientDataJSON, and credential-id mismatch fail before cryptographic verification.
- Added `tests/webauthn-assertion.mjs` for the F2 tampering cases.
- Regression at this checkpoint: Python `348 passed, 1 skipped`; Worker full portable suite green; UI F4 surface guard green.
- Full `tsc` remains dependent on installing the Worker npm dependency tree in an environment with package access.
