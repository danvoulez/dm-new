# Ledger, Grants & Evidence Report v0 (Day 2)

> Ledger remembers. Grants constrain. Evidence closes. Doubt protects.

End state of the Lab as a trustworthy bench after Day 2. Any future LLM can read this to know
what is safe to test before the physical bootstrap.

## Migrations & parity

- Migrations `0001–0003` audited (`migrations_audit.md`). SQLite ↔ Postgres parity verified
  (`sqlite_postgres_parity.md`): append-only, hash/identity, envelope forbidden-fields, and the
  `logline.receipt.v0` pin are equivalent. RLS / realtime / search_path are tolerated
  Postgres-only layers. **No silent difference alters authority/append-only/envelope.**

## Append-only

- SQLite: three independent immutability layers (generated columns, BEFORE UPDATE/DELETE
  triggers, envelope CHECKs) — `append_only_sqlite_report.md`, proven by tests.
- Postgres: trigger + RLS + content-addressing reviewed for Supabase; owner-disable caveat
  documented — `append_only_postgres_report.md`.

## Grants & authority

- Dangerous (L4/L5) work fails closed without a resolved, verified grant. Every failure has a
  precise reason (`grants_l4_l5_matrix.md`). Authority is a registry, not magic
  (`authority_registry_review.md`): a grant is invalid if its signer is not a live authority.

## WebAuthn fail-closed

- The crypto binding is optional; absent it, dangerous paths fail closed
  (`signature_layer_unavailable`) — proven without the extra (`webauthn_fail_closed.md`).

## Evidence obligations

- Only `inference.v1` carries a real obligation today (`output_hash`, `schema_hash`); incomplete
  → `evidence_incomplete` doubt, complete → `fechado` (fixtures + tests). Gaps for
  projection-build / memory-register / github-check documented and mapped to Day 4/6
  (`evidence_obligations_matrix.md`).

## Receipt molds

- Doubt/result outcomes are a closed vocabulary (`docs/RECEIPT_MOLDS.md`); `DOUBT_REASONS` is
  exhaustive and partitioned by family (pinned by test).

## Dangerous processes blocked / safe processes freed

See `dangerous_process_matrix.md`. **Safe in bench today:** memory-register.v1, projection-build.v1,
inference.v1. **Blocked (grant-gated / no door):** worker-run.v1, workflow-run.v1, route-to-devin.v1
(L4), notification.v1 (L5). **Contract-only:** attention-raise.v1, evidence-closure.v1, github-check.v1.

## Bench discipline

- `lab bootstrap {local,reset-bench,genesis,status}` + `LAB_MODE` boundary
  (`docs/BENCH_VS_BOOTSTRAP.md`). reset-bench is bench-gated and path-isolated from the real ledger.

## Final acceptance run

```
pytest -q                  189 passed
lab doctor                 ok
lab foundation suite       21 passed, 0 failed
lab dream verify           ok
lab harness                ok
lab fleet audit --root fleet   ok (no unapproved/unknown services)
bench bootstrap smoke      mode=bench has_genesis=True count=1 healthy=True
```

> `lab bootstrap dry-run` (roadmap §27) is a later-day command (full bootstrap dry-run lands
> Day 5/6); the bench lifecycle smoke above stands in for Day 2.

## Day 2 acceptance

> O Lab local pode ser usado como bancada confiável sem permitir mutação de ledger, execução
> perigosa sem grant ou fechamento sem evidência. — **met.**
