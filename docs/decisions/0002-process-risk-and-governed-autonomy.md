---
# This file is rough human material and a projection seed, not the operational truth.
# The operational truth is the LogLine Act produced by digesting this material and
# registering the resulting receipt in logline_acts (JCS/RFC8785, content-addressed,
# append-only). See ADR-0001 for the digestion form this record assumes.
who: dan@minilab.work
did: decision
this: process-risk-and-governed-autonomy
when: "2026-06-23"
confirmed_by: dan@minilab.work
if_ok: norm-active.v1
if_doubt: attention-raise.v1
if_not: stop
status: registered
aux:
  adr_id: ADR-0002
  title: Process, risk, and governed autonomy
  decision_status: accepted
  decision_class: governance
  danger_tier: L0
  companions:
    - ADR-0001 (LogLine-native digestion — how a thing comes to be)
    - ADR-0003 (Projections & Attention — the eyes and governed presence)
  references:
    - { kind: canon, ref: "LAB FINAL SPEC v0.md §11 (v3 awakening), §12 (danger tiers), §13 (authority/grants)" }
    - { kind: lab, ref: "docs/DANGER_TIERS.md (L-axis = consequence)" }
    - { kind: lab, ref: "docs/AUTOMATION_DOCTRINE.md (A-axis = continuity)" }
  laws:
    - process-not-source-privilege
    - risk-is-consequence (L0-L5)
    - scale = fixed-form + process + proportional-risk
    - automation = continuity (A0-A5) capped by danger (L)
    - jurisprudence = learning-as-process
    - autonomy = earned compression of repeated judgment
    - enzyme-not-authority
    - operational-rent (anti-cathedral)
  tags: [process, risk, automation, jurisprudence, autonomy, anti-cathedral, governance]
---

# ADR-0002 — Process, risk, and governed autonomy

## Purpose

ADR-0001 settled *how a thing comes to be* in the Lab: human material is digested into
content-addressed LogLine Acts. This record settles the complementary half: **how a thing is
treated, how it moves, and how the Lab grows — proportionally and safely**, without inventing a
metaphysics of who is allowed to be right.

## Relationship to ADR-0001

```text
ADR-0001  what a thing IS and how it COMES TO BE   (digestion, Act, envelope, custody)
ADR-0002  how a thing is TREATED and MOVES, and how the Lab GROWS   (process, risk, automation, learning)
ADR-0003  how a thing is SEEN and what earns ATTENTION   (projections v4, attention v5)
```

## Law 1 — Process, not source privilege

The Lab does not treat a statement as true because a human said it, nor false because an LLM
said it. It does not treat a file as canonical because it exists, nor a JSON object as safe
because it validates. **Every input is material.** The process determines treatment.

```text
Origin does not decide truth.
Form does not decide safety.
Process decides treatment.
Risk decides rite.
Consequence decides weight.
```

This dissolves the need for any special status for "what the LLM said" vs "what the human
said." Both are participants in processes — with different roles, grants, and confirmation
powers — never inherently true. The same human sentence may move through a light process or a
heavy one depending entirely on what it would *do*.

## The risk matrix (L0–L5) — consequence

Risk classifies the **consequence of one act**. The canonical matrix lives in
`docs/DANGER_TIERS.md`:

```text
L0 read / projection (no external effect)
L1 local ledger write
L2 deterministic bounded local action
L3 external integration, no irreversible effect
L4 external compensable effect      (grant + signoff + budget + sandbox)
L5 external irreversible effect      (strictest gate)
```

Risk is a property of the *act's consequence*, not of its origin or its prose.

## The scale law

```text
fixed canonical form        -> everything is written in one mold (ADR-0001)
+ processual classification -> each thing knows which rite it passes through (Law 1)
+ proportional risk         -> each rite carries weight matched to consequence (L0-L5)
= scale
```

Fixed form prevents chaos; process prevents arbitrariness; proportional risk prevents both
recklessness and paralysis. **The Lab scales because it does not decide everything by hand.**

## Automation — continuity capped by consequence

Automation is **permission to continue under contract** — how far a process may move without
fresh human input. It is a *second axis*, distinct from danger:

```text
L-axis (danger)      = consequence of one act           (docs/DANGER_TIERS.md)
A-axis (automation)  = continuity / self-movement       (docs/AUTOMATION_DOCTRINE.md)

binding law:  an automation level A_n is CAPPED by the danger tier it is rated for.
              A process may self-move autonomously only up to its permitted L.
```

Two governing truths:

1. **Loop-risk = act-risk + repetition-risk.** A harmless act repeated a thousand times can
   become dangerous through fanout, cost, noise, or attention saturation. A loop is never judged
   by one iteration.
2. **No closure, no automation.** A process that cannot declare its trigger, its limit, its
   evidence, and its closure does not automate — it may still exist and run manually.

The detailed A0–A5 ladder (trigger, initiator, loop, closure, evidence per level) is the
operational reference in `docs/AUTOMATION_DOCTRINE.md`, mirroring the danger matrix.

## Jurisprudence — learning is a process

The Lab learns over time, but **jurisprudence never becomes truth — it becomes tested process
compression**. Closed cases may lighten future treatment only through a process:

```text
closed cases
  -> projection of the recurring pattern (non-authoritative)
  -> hypothesis of a scoped rule (declares scope + counterexamples + supporting case hashes)
  -> replay against history (would it have erred?)
  -> shadow mode (predicts but does not move the runtime)
  -> promotion proportional to risk
  -> active rule with a review / sunset / supersession condition
```

Confidence never becomes authority; it only selects *which rite may be attempted*. Low-risk
precedent (L0/L1) may compress quickly; L2 uses shadow/review; L3+ needs explicit grants;
**L4/L5 never emerge from precedent alone.** Learning itself registers, is evaluated, carries
risk, leaves evidence, and may be doubted or superseded — it enters through the front door.

## Governed autonomy

```text
scale + learning over time = governed autonomy
```

Autonomy is **not** permissionless action. It is **earned compression of repeated judgment**:
the Lab handles more, faster, with less direct intervention, because repeated registered
processes have taught it which movements can safely become lighter. Stages, roughly:

```text
A0 manual        Dan points; Lab records.
A1 assisted      LLM digests; human approves; Lab registers.
A2 patterned     Lab recognizes repeated low-risk shapes and suggests process.
A3 fast-path     L0/L1 processes move with light or no review.
A4 governed-auto reversible/low-risk processes execute under executor rules.
A5 delegated     specific higher-risk processes run under explicit grants/budgets/scopes/evidence.
A6 institutional standing routines, audits, safe closures with minimal intervention.
```

## The enzyme boundary

The LLM is the **digestive enzyme** of the Lab, not its sovereign organ. The permitted miracle:

```text
language -> structure
```

The forbidden moves (for the LLM, and by Law 1, for any origin asserting itself):

```text
structure -> authority      (self-ratification)
authority -> consequence    (executing its own proposal, mutating canon, closing its own loop)
```

The LLM may classify, summarize, route, mine, structure, propose, raise attention, and emit
candidate Acts (pre-registration). It may not execute code, send externally, mutate canon, or
ratify itself. **Safety comes from process classification, not from trusting any origin.**

## Risks and hardeners

| Risk | Hardener |
|---|---|
| **Reflexivity** — the Lab describes itself instead of improving life/work | **Operational rent**: every canon object must cash out into fields, tests, contracts, projections, attention, or decisions. Enforced by a watcher (below), not willpower. |
| **Digestion loss** — LLM translation is lossy and non-deterministic | The Lab does not freeze pure intention; it freezes a **content-addressed interpretation** with author, source, model, context, doubt, and ratification. Truth is born when the translation is registered, evaluated, and closed by process. |
| **Authority inflation** — "the LLM understood" mistaken for "this is true" | Law 1 + the enzyme boundary: movement comes only through process; nothing is true by origin. |
| **Livability failure** — elegant but does not make Dan's days lighter | The **Day-8 livability test** below. |

**Operational rent, made self-enforcing.** "Every beauty must pay operational rent" is itself a
process: a low-tier recurring watcher (e.g. `canon_rent_audit.v1`, danger L1 / automation A2)
flags any canon Act that, after a review window, has produced **zero** downstream Acts, tests,
projections, contracts, or attention — surfacing it as `attention`, not deleting it. The
doctrine against liturgy is enforced by the runtime.

**The Day-8 livability test.** The Lab is not successful because it is coherent. It is
successful when it reduces friction in real life and business operation. Track it as a
projection: human-correction rate, time-to-closure, attention backlog. *Build the cathedral —
and keep checking that you can still live in it.*

## Decision (the laws this record sets)

1. **Process, not source privilege** — origin decides nothing; process decides treatment, risk
   the rite, consequence the weight.
2. **Risk is consequence** — the L0–L5 danger matrix classifies what an act *does*.
3. **Scale = fixed form + processual classification + proportional risk.**
4. **Automation is continuity (A0–A5), capped by danger (L); loop-risk = act-risk +
   repetition-risk; no closure, no automation.**
5. **Jurisprudence is learning-as-process** — precedent compresses into scoped, tested,
   reviewable rules; it never becomes truth; L4/L5 never auto-emerge.
6. **Autonomy is earned compression of repeated judgment** — governed continuity, never
   permissionless.
7. **The enzyme boundary** — any origin (LLM or human) gains movement only through process; the
   LLM may reveal structure but may not self-ratify, execute, mutate canon, or close its loop.
8. **Operational rent** — canon that cannot become Act, test, contract, projection, attention,
   or decision is literature, not runtime priority; a watcher enforces this.

## Consequences

- The Lab needs no special metaphysics for LLM vs human input — one process machinery serves
  both, proportionally.
- Autonomy grows exactly where it is safe to grow (low danger, reversible, well-precedented),
  and stays governed where consequence is high.
- The anti-cathedral and livability laws are themselves processes, so the doctrine is
  self-checking rather than aspirational.

## Open reconciliations

1. Exact A0–A5 ↔ L0–L5 cap table (drafted in `AUTOMATION_DOCTRINE.md`; tune against real cases).
2. The `did` family for jurisprudence rules (e.g. `rule`, `precedent`) and for the rent watcher.
3. How `canon_rent_audit` measures "downstream" (citation graph over `content_hash`).
4. Reconcile Universal Inbox v4/v5 detail into the automation/attention vocabulary (ADR-0003).

## Status

`registered` / accepted. Complementary to ADR-0001; supersede only by a later `did=decision`
receipt citing this record's hash — never by edit-in-place.
