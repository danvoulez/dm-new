# Outbound Membrane Notes (notification.v1)

> The row is the durable event; the bell is a consequence. A notification is the first
> outbound effect that cannot be un-rung.

`notification.v1` is classified **L5 (irreversible)** (§20). It has no registered adapter, so
it cannot execute locally; when a real outbound channel is wired (Day 6), it must pass through
an outbound membrane that makes at-least-once infrastructure behave as **effectively
exactly-once**.

## Adapted pattern: transactional outbox + idempotency (not bespoke)

Rather than invent delivery semantics, adopt the well-established **transactional outbox +
consumer idempotency** pattern and fit it to the Lab's append-only ledger:

1. **Intent is a ledger Act, not a side effect.** A `notification.v1` request is an
   append-only Act (the outbox row already lives in `logline_acts`). Deciding to notify and
   recording the intent happen in the same durable write — no dual-write gap.
2. **A separate relay performs the effect.** The executor (with a future `notification`
   adapter + grant) reads the committed intent and performs the send. The decision and the
   effect are decoupled, exactly like an outbox relay.
3. **Idempotency key, never a timestamp.** The effect is keyed by the Act's `content_hash`
   (a stable, content-addressed id) so a retry of the same intent is de-duplicated. The
   research is explicit that timestamps and whole-body hashes are anti-patterns.
4. **Commit/failure is its own evidence Act.** The send result (delivered / failed) is a
   separate result Act (`evidence_obligation: separate-result-act`) carrying the provider's
   message id — future `evidence_must_include` for notification.

## Why L5 + grant + airlock

A delivered notification cannot be recalled. So: a strong grant is required (authority +
budget + scope), the effect-spec must be declared before the adapter is built, and bench
**never** sends (no adapter registered → fail closed). This is the "airlock": intent can be
rehearsed locally, but the outbound door only opens under an explicit, signed grant.

## Open decisions (for Day 6)

- Provider + channel taxonomy (email / webhook / push) and their per-channel idempotency keys.
- Whether consumer-side dedupe (inbox pattern) is needed if the provider is not idempotent.
- `evidence_must_include` for a delivered notification (e.g. `provider_message_id`, `channel`).

## Sources

- [Transactional outbox pattern — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- [Outbox, Inbox patterns and delivery guarantees explained — Event-Driven.io](https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/)
- [Transactional Outbox & Idempotency: Exactly-Once over At-Least-Once](https://medium.com/@mohamadshahkhajeh/transactional-outbox-idempotency-in-laravel-exactly-once-effects-over-at-least-once-f4bae734d75f)
