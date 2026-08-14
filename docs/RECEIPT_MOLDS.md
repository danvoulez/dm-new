# Receipt Molds (doubt & result)

> Future LLMs recognize states without guessing free text.

A doubt is never a generic error and a result is never an ambiguous blob. Every non-clean
outcome carries a stable `did` + `status` + a `reason` drawn from a closed vocabulary
(`lab.runtime.DOUBT_REASONS`). This document is the map from the spec's coarse mold families
to the precise reasons the runtime emits. `tests/test_receipt_molds.py` pins it.

## Result molds

| Mold | `did` | `status` | When |
|---|---|---|---|
| `result.fechado` | `fechado` / `llm.receipt` | `fechado` | adapter ran and proved the declared evidence |
| `result.doubted` | `not_dispatched` / `evidence_incomplete` | `doubted` | a procedural barrier blocked dispatch or closure (carries a `reason`) |
| `result.failed` | — (queue `status='failed'`) | — | adapter raised (`AdapterError`); queue row marked failed |

`result.refused` (spec) is realized as a `doubted` `not_dispatched` receipt — a refusal IS a
durable doubt here, not a separate shape.

## Doubt molds (family → concrete reasons)

| Mold family (spec) | Concrete `reason`(s) |
|---|---|
| `doubt.no_adapter_configured` | `no_adapter_configured`, `adapter_not_registered` |
| `doubt.dispatch_mismatch` | `dispatch_mismatch` |
| `doubt.contract` | `unknown_process`, `process_route_mismatch`, `process_not_active`, `incomplete`, `activation_rules_not_explicit`, `did_not_admitted`, `confirmed_by_not_authorized`, `this_not_canonical`, `this_not_content_hash`, `when_invalid`, `when_not_future`, `confirmation_evidence_invalid`, `if_ok_incompatible`, `if_doubt_incompatible`, `if_not_incompatible`, `status_initial_invalid`, `unknown_predicate` |
| `doubt.grant_required` | `missing_required_grant` |
| `doubt.grant_invalid` | `grant_not_found`, `grant_subject_mismatch`, `grant_process_mismatch`, `grant_adapter_mismatch`, `who_not_authorized`, `grant_not_active`, `grant_revoked`, `grant_expired`, `missing_grant_expiry`, `missing_timeout`, `missing_sandbox_scope`, `missing_network_policy`, `budget_exhausted` |
| `doubt.authority` | `missing_authority`, `unregistered_authority`, `grant_unsigned`, `signoff_signer_mismatch`, `signature_layer_unavailable` |
| `doubt.evidence_incomplete` | `evidence_obligation_unmet` |

The runtime intentionally keeps reasons **finer** than the spec's `grant_invalid` family: a
doubt says precisely *which* invariant failed. The family column is the stable bucket an LLM
can switch on; the concrete reason is the precise diagnosis.

## Required keys on a doubt receipt

`who`, `did`, `this` (source hash), `when`, `confirmed_by`, `status='doubted'`,
`reason ∈ DOUBT_REASONS`, `process_id`. Selector doubts add `missing_slots`; evidence doubts
add `missing_evidence`; dispatch-mismatch adds `queued_adapter` / `expected_adapter`.

## Acceptance (§17)

> futuras LLMs conseguem reconhecer estados sem adivinhar texto livre — **met**: molds are a
> closed vocabulary, every emitted reason maps to exactly one family, and the mapping is
> enforced by test.

## doubt.adapter_rejected

Used when a governed adapter/model/schema boundary refuses dispatch after selection.

Reasons: `adapter_rejected`.
