# Day 2 §11 — Authority Registry Review

> Authority is registered structure, not vibe. A grant is only as good as the authority that
> signed it.

Review of `lab/authority.py` against the requirement that a grant is invalid if its authority
does not exist or is not valid. Covered by `tests/test_authority.py` (7 tests) and the
executor authority paths in `test_runtime.py`.

## Lifecycle

| Step | Mechanism | Notes |
|---|---|---|
| **Registered** | append-only Act `did='authority'` | genesis authority is self-attested (`register_genesis_authority`): the buck stops at the root. |
| **Referenced by grants** | `grant.granted_by` must be a recognized authority | resolved at verify time, not trusted from the Act. |
| **Revoked** | later append-only Act `did='authority-revoke'` | never a silent delete; revocation is itself a receipt. |
| **Recognition check** | `authority_recognized(db, identity)` | returns `(False, 'missing_authority')` for empty, `(False, 'unregistered_authority')` for unknown, `(True, 'authority_registered')` otherwise. |

## Failure modes verified

| Condition | Outcome | Test |
|---|---|---|
| identity never registered | not recognized (`unregistered_authority`) | test_authority, test_runtime |
| empty/None signer | refused (`missing_authority`) | test_authority, test_runtime |
| non-authority tries to register another | refused | test_authority |
| revoked authority | recognition removed; revoke is append-only | test_authority |
| revoker not itself a recognized authority | refused | test_authority |
| grant signed by unregistered authority | grant blocked (`unregistered_authority`) | test_runtime |

## The honest seam (structure vs. authorship)

`authority.py` is the **structural** layer: a content hash proves *integrity*, not *authorship*.
Anyone who can write the ledger (e.g. `service_role`) could forge an authority Act. Real
"an LLM cannot forge this" security arrives only with the **binding** layer — a passkey/
WebAuthn assertion over the Act's `content_hash`, verified against an enrolled authenticator
(`verify_signature`). Until that binding is enrolled, grants are *structurally governed*, not
*cryptographically secure*. This is documented in code and gated fail-closed (§12).

## Acceptance (§11)

> grant não vale se sua authority não existe ou não está válida — **met**: recognition is a
> registry lookup with explicit `missing_authority` / `unregistered_authority` reasons, and
> the executor refuses grants whose signer is not a live authority.
