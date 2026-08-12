# Playbook — `grant_invalid`

A grant failure is an operational path, not confusion. This is how an LLM operator recognizes
and acts on a dangerous-work refusal.

## How to recognize

A `did='not_dispatched'`, `status='doubted'` result whose `reason` is in the grant family
(`docs/RECEIPT_MOLDS.md` → `doubt.grant_required` / `doubt.grant_invalid` / `doubt.authority`):

`missing_required_grant`, `grant_not_found`, `grant_subject_mismatch`, `grant_process_mismatch`,
`grant_adapter_mismatch`, `who_not_authorized`, `grant_not_active`, `grant_revoked`,
`grant_expired`, `missing_grant_expiry`, `missing_timeout`, `missing_sandbox_scope`,
`missing_network_policy`, `budget_exhausted`, `missing_authority`, `unregistered_authority`,
`grant_unsigned`, `signoff_signer_mismatch`, `signature_layer_unavailable`.

## Where it appears in the ledger

```
lab read --status doubted
lab inspect <result_hash>     # reason, danger_tier, grant_id, budget_required
```

## How an LLM should explain it

State the precise barrier, not "it failed": e.g. *"worker-run.v1 was refused with
`grant_expired`: its grant's validity window has passed. The work is intact; it needs a fresh
grant."* The reason names exactly which invariant failed.

## What next process to suggest

| Reason | Next step |
|---|---|
| `missing_required_grant` / `grant_not_found` | register a grant (`did=grant`) for this process + subject |
| `grant_expired` / `grant_revoked` | issue a new grant; cite the old one |
| `budget_exhausted` | new grant with sufficient ACU, or split the work |
| `missing_sandbox_scope` / `*_mismatch` | correct the grant's scope/process/adapter/subject |
| `grant_unsigned` / `signoff_signer_mismatch` | the granting authority must passkey-sign the grant |
| `signature_layer_unavailable` | install the `[webauthn]` extra on the signing host |
| `missing_authority` / `unregistered_authority` | register the signing identity as an authority first |

## What never to do

- Never hand-write a `fechado` to bypass the gate. Dangerous work without a valid grant never
  runs — that is the point.
- Never weaken a contract's `danger_tier` to dodge the requirement.
- Never forge an authority Act to satisfy `granted_by` (structure ≠ authorship; see §11).
