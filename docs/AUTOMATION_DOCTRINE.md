# Automation Doctrine (A0–A5)

> Triggers, loops, closure, and governed continuity. The law-setting record is
> [ADR-0002](decisions/0002-process-risk-and-governed-autonomy.md); this is the operational
> reference for the **A-axis**, mirroring `DANGER_TIERS.md` for the **L-axis**.

Automation is **permission to continue under contract** — how far a process may move without
fresh human input. It is a *second axis*, distinct from danger:

```text
L-axis (DANGER_TIERS.md) = consequence of one act
A-axis (this doc)        = continuity / self-movement
```

**Binding law:** an automation level `A_n` is **capped by the danger tier** the process is rated
for. A process may self-move autonomously only up to its permitted L.

## Root laws

```text
No trigger without process.   (a trigger only wakes; the contract decides what may happen)
No loop without limit.        (loop-risk = act-risk + repetition-risk)
No effect without evidence.
No automation without closure. (declare how it stops, or it does not automate)
```

## The A-scale

| A | Name | Self-movement allowed | Capped at danger | Typical trigger | Loop? | Closed by |
|---|---|---|---|---|---|---|
| **A0** | Manual | nothing moves without a human act | any | human | no | human |
| **A1** | One-shot | one bounded move per sufficient input | ≤ L1 | human / ledger insert | no | process (auto) |
| **A2** | Recurring | scheduled/reactive internal routines | ≤ L1 | clock / state change / projection signal | bounded | process (auto) + review interval |
| **A3** | Governed effect | prepared/performed external effect | ≤ L3 | approved rule / accepted attention | bounded, **grant** | process + effect receipt |
| **A4** | Dangerous execution | run code / workers / infra | ≤ L4 | approved request + grant | exceptional, **grant+budget+sandbox** | success/failure/rollback receipt |
| **A5** | Delegated operation | standing operational responsibility | ≤ L5 | standing operating grant | loop-native inside a declared box | periodic closure + review + retirement |

The level is **not prestige** — it is how much continuity is permitted without asking again.
Simple things move quickly (A1–A2); ambiguous things raise attention; dangerous things require
grants, budget, sandbox, and evidence (A3+). Jurisprudence may *lighten* a process's A-level
over time (ADR-0002), but never above its danger cap, and **L4/L5 never auto-emerge from
precedent alone**.

## Escalation

Automation may stay low only while consequence stays low. A process escalates (and must
re-qualify) when it crosses a boundary:

```text
preview -> registration        one-shot -> loop          single item -> batch
reversible -> compensable       compensable -> irreversible    local -> network
private -> shared               suggestion -> execution        projection -> active rule
```

Escalation is not failure; it is the Lab recognizing the movement now needs a heavier rite.

## Minimum automation contract

A process automates only if it declares at least:

```yaml
automation:
  level: A0 | A1 | A2 | A3 | A4 | A5
  danger_cap: L0 | L1 | L2 | L3 | L4 | L5     # A may not exceed this
  trigger:   { kind: human|schedule|ledger_insert|state_change|webhook|projection_signal|precedent, selector: ... }
  initiator: { allowed: [...], requires_grant: true|false }
  loop:      { allowed: true|false, max_iterations: ..., max_duration: ..., max_fanout: ..., pause_when: ... }
  evidence:  { required: [input_hash, output_hash, ...] }
  closure:   { closes_when: [...], closed_by: [process|human|supervisor|timeout] }
  escalate_when: [...]
```

Missing these fields → the process may exist and run manually (A0), but it does not automate.

## Jurisprudence & automation

Repeated closed cases may compress into a rule that lowers a process's A-level — but only
through the jurisprudence process (ADR-0002): the rule cites its supporting cases, declares
scope and counterexamples, passes replay, runs in shadow, and carries a review/sunset. The rule
**never raises the danger cap**; it only permits a lighter rite within it.

## The anti-cathedral watcher (an example automation)

`canon_rent_audit.v1` — danger **L1**, automation **A2** (recurring, internal). It flags any
canon Act that, after a review window, has produced zero downstream Acts / tests / contracts /
projections / attention, surfacing it as `attention` (never deleting). The doctrine that beauty
must pay operational rent is thus enforced by the runtime, not by willpower.

## Summary

```text
A0 manual      "wait for me"
A1 one-shot    "do it once when ready"
A2 recurring   "keep it tidy on a rhythm"
A3 effect      "do the governed external thing"
A4 execute     "run the dangerous thing, under grant"
A5 operate     "keep operating the thing, under a standing box"
```

```text
Origin does not decide truth.   Form does not decide safety.
Process decides treatment.      Risk decides rite.        Consequence decides weight.
Fixed form permits scale.       Automation (capped) permits continuity.
Jurisprudence permits learning. Together they permit governed autonomy.
```
