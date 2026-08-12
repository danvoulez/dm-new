# Day 2 §12 — WebAuthn Fail-Closed

> Absence of a cryptographic library reduces capability, never security.

The passkey/WebAuthn binding is the ONE place that needs asymmetric crypto, so it is an
**optional** boundary (`lab/signing/`), never a kernel dependency. The risk to avoid: if the
extra is not installed, the Lab must not accept a dangerous grant unverified.

## The seam

`authority.verify_signature` imports the verifier lazily and fails closed:

```python
try:
    from .signing.webauthn_verifier import verify_act_signoff
except ImportError:
    return False, "signature_layer_unavailable"
```

`grants.require_grant_signoff` (the L4/L5 gate) returns this up to the executor, which closes
the work as a durable `doubted` receipt — it is **never** dispatched.

## Verified (without needing the extra)

`tests/test_webauthn_fail_closed.py` forces the seam to be unavailable
(`sys.modules['lab.signing.webauthn_verifier'] = None`) and asserts:

1. `verify_signature` → `(False, 'signature_layer_unavailable')`.
2. `require_grant_signoff` on an otherwise-valid, signed-off grant → `signature_layer_unavailable`.
3. The executor blocks L4 work with `reason='signature_layer_unavailable'`, `did='not_dispatched'`.

These tests **run in the zero-dependency environment** (they don't skip). Discrimination is
proven: with the crypto extra present, the same setup yields `no_enrolled_authenticator`, not
`signature_layer_unavailable` — so the reason arises *only* from the absent layer.

## Extra needed for full signed-path CI

The signed happy path (`tests/test_signing.py`, 12 tests) requires the optional extra and
skips cleanly without it:

```
pip install dream-machine-lab[webauthn]   # webauthn>=2,<3
```

A complete CI run installs `[webauthn]` so both the fail-closed path (always on) and the
signed happy path (extra present) are exercised.

## Acceptance (§12)

> ausência de biblioteca criptográfica reduz capacidade, não reduz segurança — **met**: the
> kernel imports no crypto, the seam fails closed, and dangerous work is blocked when the
> extra is absent.
