# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a
vulnerability.

- Use GitHub's **[Report a vulnerability](https://github.com/danvoulez/dm-new/security/advisories/new)**
  (Security → Advisories) to open a private advisory, **or**
- email the maintainers (see the repository owner's profile).

Include the affected version/commit, a description, reproduction steps, and impact.

## Supported versions

This project is pre-1.0. Security fixes target `main` and the latest release.

## Security model

### Deterministic receipt identity is load-bearing

Receipt v1 separates semantic and occurrence identity:

```text
content_hash  = H(JCS(LogLine 9 + AUX))
envelope_hash = H(JCS(envelope))
tuple_hash    = H(content_hash + envelope_hash)
```

A divergence in JCS/canonicalization or in any of these hash-domain rules is a security
issue. `content_hash` must not be mistaken for occurrence identity when envelope ancestry
matters.

### Integrity is not authorship

A hash proves deterministic content binding. It does **not** prove who authored or was
entitled to perform the semantic act. Actor (`who`), scribe/caller identity, grants, and
cryptographic signoff are distinct facts.

### Verify before append

Canonical semantic writes are verified before ledger mutation. A path that silently fills
missing semantics, changes authored content to make verification pass, or appends an
objectively invalid proposal violates the kernel boundary.

### Process ancestry is immutable

For canonical process instances:

- `opened_process` content hash identifies the instance;
- descendant `envelope.process` points to that opening hash;
- descendant `envelope.parent` points to the prior occurrence `tuple_hash`.

Forks, stale-parent acceptance, or treating mutable process state as stronger than ledger
ancestry are security-relevant integrity failures.

### Authority has structural and cryptographic layers

- Structural authority/grant records are append-only and auditable.
- WebAuthn/passkey signoff provides the cryptographic human authorization boundary used by
  dangerous work.

Anyone with privileged database credentials may still be able to forge structural records;
protect service-role and operational secrets accordingly.

### Dangerous work fails closed

L4/L5 effects require the applicable grant/signoff and safety constraints. Unknown
activities, missing or invalid grants, invalid signatures, expired leases, stale custody,
and unmet evidence obligations must not be converted into successful execution.

### Custody is coordination, not authority

Claims, leases, attempts, and current-work rows are ephemeral runtime state. Before an
effect, the executor re-projects the process head. A stale queue/custody row must never be
able to advance a process that has moved on.

### Projections are not truth

Search indexes, UI summaries, projections, mutable caches, and compatibility queues are
rebuildable/non-authoritative. A way to advance canonical state by editing one of these is
a security bug.

### Ledger hardening

`public.logline_acts` is append-only; mutation protections and RLS are part of the security
boundary. Realtime/event delivery is a bell, never the only copy of authority.

## High-value reports

We particularly want reports that demonstrate any of the following:

- verify-after-append behavior on a canonical path;
- silent semantic correction or fabrication;
- receipt/JCS/hash-domain divergence;
- process-parent or process-instance ancestry bypass;
- stale custody executing after the process head changed;
- grant/WebAuthn bypass for dangerous effects;
- fake completion without required evidence;
- mutable projections or compatibility tables overriding ledger truth;
- sensitive operational credentials exposed to clients or models.
