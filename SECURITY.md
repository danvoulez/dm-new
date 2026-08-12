# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a
vulnerability.

- Use GitHub's **[Report a vulnerability](https://github.com/danvoulez/dream-machine/security/advisories/new)**
  (Security → Advisories) to open a private advisory, **or**
- email the maintainers (see the repository owner's profile).

Include: affected version/commit, a description, reproduction steps, and impact. We aim
to acknowledge within a few business days and will coordinate a fix and disclosure
timeline with you.

## Supported versions

This project is pre-1.0. Security fixes target the `main` branch and the latest release.

## Security model (what the design does and does not guarantee)

This runtime is built around explicit closure discipline. Understanding the boundaries
helps you report meaningful issues.

- **Determinism is load-bearing.** An Act's identity is the SHA-256 of its
  [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785) canonical bytes. Canonicalization
  uses the vendored Trail of Bits reference implementation (`lab/_vendor/rfc8785/`) and is
  proven against the official conformance vectors. **A divergence that makes two
  conformant implementations hash the same Act to different bytes is a security bug.**

- **Integrity vs. authorship.** A content hash proves a record was not altered; it does
  **not** prove who wrote it. Authorship is established by the cryptographic binding layer.

- **Authority — two layers:**
  - *Structural* (`lab/authority.py`): authorities and grants are registered append-only
    Acts, revocable and traceable to a genesis. This is auditable but **not, by itself,
    cryptographically secure** — anyone able to write the ledger (e.g. a Postgres
    `service_role`) can forge an authority Act.
  - *Cryptographic* (`lab/signing/`, optional `[webauthn]` extra): a passkey/WebAuthn
    (FIDO2) assertion over the Act's `content_hash`. Hardware-bound, biometric/PIN-gated;
    an LLM cannot produce it.

- **Dangerous work fails closed.** All **L4/L5** execution requires a verified passkey
  signoff on the grant. With no signoff, an invalid signature, or the crypto extra
  absent, the work is **blocked** (`grant_unsigned` / `signature_layer_unavailable` /
  `signoff_signer_mismatch`), never run.

- **Ledger hardening** (`migrations/`): `public.logline_acts` is append-only (UPDATE/DELETE
  blocked by triggers even for `service_role`) with RLS enabled and **no policies** by
  design (service-role-only writes). Realtime is a bell, never the only copy.

- **Out of scope / known boundaries:** the browser/client WebAuthn ceremony (assertions
  produced by a real passkey in a frontend) is not part of this server-side core;
  enrollment attestation trust still depends on a recognized registrar. Operational
  secrets (Supabase `service_role`, access tokens) must be kept server-side.

If you find a way to advance state without legitimate closure — a silent drop, a fake
completion, forged authority, or non-deterministic hashing — that is exactly the class of
issue we want to hear about.
