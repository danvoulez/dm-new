# Day 2 §10 — L4/L5 Grant Matrix

Dangerous work (L4/L5) does not execute without a *resolved, verified* grant. Authority lives
on the grant (LAB FINAL SPEC §13), not on the requesting Act — the Act carries only a
`grant_id`. The executor reads authority, budget, window, and sandbox from the registered
grant it resolves to.

## L4/L5 processes

| Process | Tier | Adapter | Requires grant | Requires signoff | Requires budget | Requires sandbox |
|---|---|---|---|---|---|---|
| worker-run.v1 | L4 | worker_run | yes | yes | yes (ACU) | yes (fs_scope) |
| workflow-run.v1 | L5 | workflow_run | yes | yes | yes (ACU) | yes (fs_scope) |

## Verification gates (each a fail-closed `doubted` close, never a silent drop)

Order in the executor: activation → grant resolution/verification → passkey signoff →
dispatch-mismatch → adapter-registration → dispatch.

| Failure | Reason | Test |
|---|---|---|
| no `grant_id` on the Act | `missing_required_grant` | test_runtime, test_grants_danger_tiers |
| `grant_id` resolves to nothing | `grant_not_found` | test_runtime |
| grant issued to another subject | `grant_subject_mismatch` | test_runtime |
| grant for another process | `grant_process_mismatch` | test_runtime |
| grant adapter scope wrong | `grant_adapter_mismatch` | test_grants |
| `who` not in allowed_who | `who_not_authorized` | test_grants |
| expired | `grant_expired` | test_runtime |
| revoked | `grant_revoked` | test_runtime |
| budget exhausted | `budget_exhausted` | test_runtime |
| missing sandbox scope | `missing_sandbox_scope` | test_runtime |
| missing timeout / expiry / network policy | `missing_*` | test_grants |
| signer not the granting authority | `missing_authority` / `unregistered_authority` | test_runtime |
| no passkey signoff | `grant_unsigned` | test_runtime |
| signoff signer ≠ granted_by | `signoff_signer_mismatch` | test_grants |
| crypto extra absent | `signature_layer_unavailable` | test_webauthn_fail_closed |

## Acceptance (§10)

> perigo sem grant não executa nunca — **met**: every L4/L5 path is gated, and each failure
> is a precise, durable doubt. See `docs/DANGER_TIERS.md` for the tier rationale.
