# Playbook — `evidence_incomplete`

Missing evidence is a first-class state, not a human workaround. The adapter ran but did not
prove the contract's declared `evidence_must_include`.

## How to recognize

A result with `did='evidence_incomplete'`, `status='doubted'`, `reason='evidence_obligation_unmet'`,
and a `missing_evidence` list of the absent fields. The queue item is *closed* (resolved), not
left dangling — but it is NOT a `fechado`.

```
lab read --status doubted
lab inspect <result_hash>     # reason, missing_evidence, plus what the adapter DID produce
```

## Which evidence was missing

Read `missing_evidence` on the result — it lists exactly the declared fields the adapter output
lacked (e.g. `["output_hash"]`). The obligation per process is in
`reports/day2/evidence_obligations_matrix.md`.

## How to re-execute or correct

1. Fix the adapter so it emits the missing field(s) — the obligation is a contract, the adapter
   is the implementation.
2. Re-register the source intent and re-queue; the executor re-runs and, if the proof is now
   present, closes `fechado` cleanly.
3. The original `evidence_incomplete` doubt stays in the ledger as the audit trail — append-only;
   you do not rewrite it.

## When to open a doubt

The runtime already writes the doubt automatically. Open an additional attention/doubt only if
the gap reveals a contract problem (e.g. an obligation no adapter can satisfy) that needs a human
or design decision.

## When manual closure is forbidden

**Always.** Never hand-write a `fechado` over an `evidence_incomplete`. "A result receipt exists"
is not "the obligation was proven." Closing over a ghost is exactly what this state prevents.
