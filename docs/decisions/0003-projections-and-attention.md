---
# This file is rough human material and a projection seed, not the operational truth.
# The operational truth is the LogLine Act produced by digesting this material and
# registering the resulting receipt in logline_acts. See ADR-0001 for the digestion form
# and ADR-0002 for the governance this record assumes.
who: dan@minilab.work
did: decision
this: projections-and-attention
when: "2026-06-23"
confirmed_by: dan@minilab.work
if_ok: norm-active.v1
if_doubt: attention-raise.v1
if_not: stop
status: registered
aux:
  adr_id: ADR-0003
  title: Projections (v4) and Attention (v5)
  decision_status: accepted
  decision_class: perception
  danger_tier: L0
  companions:
    - ADR-0001 (LogLine-native digestion — how a thing comes to be)
    - ADR-0002 (Process, risk, governed autonomy — how it is treated and moves)
  references:
    - { kind: canon, ref: "LAB FINAL SPEC v0.md §14 (Projections v4), §15 (Attention v5)" }
    - { kind: canon, ref: "LAB OPERATING ATLAS.md §16 (Projection v4), §18 (Attention v5)" }
    - { kind: lab, ref: "lab/projections.py (project_build: class/pin/ladder_level/input_hashes)" }
    - { kind: lab, ref: "lab/runtime.py raise_doubt + DOUBT_REASONS; processes/attention-raise.v1.yml" }
  laws:
    - projections-are-eyes-not-truth
    - stable-projections-are-deterministic-maps
    - dynamic-projections-are-ladders-not-blobs
    - attention-is-scarce-governed-presence
    - doubt-is-a-handoff-not-an-error
  tags: [projections, dynamic-projections, ladder, attention, doubt, v4, v5, perception]
---

# ADR-0003 — Projections (v4) and Attention (v5)

## Purpose

ADR-0001 settled *how a thing comes to be* and ADR-0002 *how it is treated and moves*. This
record closes the corpus with the third complementary half: **how a thing is seen, and what
earns scarce human/model attention** — the eyes (Projections, v4) and the governed presence
(Attention, v5).

## Relationship to ADR-0001 / ADR-0002

```text
ADR-0001  how a thing COMES TO BE        (digestion, Act, custody)
ADR-0002  how it is TREATED and MOVES    (process, risk, automation, learning)
ADR-0003  how it is SEEN and what earns ATTENTION   (projections, the ladder, attention)
```

A projection is a *human/LLM projection* of registered Acts — the last stage of the digestion
pipeline (ADR-0001). Attention is where the doubt that ADR-0002 insists on preserving becomes a
governed request for a hand.

## Projections are the Lab's eyes — never its truth

Projection is how Dan, UIs, and LLMs see the ledger without reading raw rows forever. The
projection store (Mongo, SQLite mirror, anything) is **influential to ergonomics, never to
institutional truth**:

```text
A projection may guide, summarize, cluster, and help an LLM think.
A projection may NOT activate consequence, become a gate, be patched as authority,
  or be the only place something exists.
```

Every projection declares its non-authority and its rebuildability (already enforced in
`lab/projections.py`):

```json
{ "authoritative": false, "rebuildable": true, "computed_at": "...",
  "projection_version": "...", "sources": ["logline_acts"], "input_hashes": ["..."] }
```

Because a projection cites its `input_hashes`, it is always traceable back to the Acts it was
computed from, and always reproducible. If a projection and the ledger disagree, **the ledger
wins and the projection is rebuilt.**

## Stable projections — deterministic maps

Stable projections are deterministic, rebuildable maps for navigation and orientation:

```text
lab_current_state · lab_current_law · lab_process_index · lab_current_runnable_processes
lab_runtime_readiness · lab_doc_gaps · lab_ghosts_and_gaps · lab_attention_index
```

They answer "where am I? / what is current? / what is missing? / what can run? / what needs
attention?" — and they are **not** for making irreversible decisions. (`CURRENT_RUNNABLE_PROCESSES.md`
is already a generated stable projection.)

## Dynamic projections and the ladder

Dynamic projections are the crème: not summaries but **LLM-facing reasoning ladders**. A
dynamic projection involves model inference, so it must carry a `pin` (already required by
`lab/projections.py`):

```json
{ "class": "dynamic", "authoritative": false, "rebuildable": true,
  "projection_spec_hash": "...", "ladder_level": "L0..L5",
  "pin": { "model": "...", "prompt": "...", "params": {}, "seed": "..." } }
```

Without the pin it is a loose guess; with the pin it is still not authority, but it is
**inspectable and reproducible**.

**Ladders, not blobs.** The bad version stuffs the whole ledger into one context. The good
version climbs:

```text
L0 raw Acts
  -> L1 grouped citations
  -> L2 process clusters
  -> L3 themes / conflicts / gaps
  -> L4 candidate interpretations
  -> L5 candidate Acts / proposals
```

Each rung **cites the rung below**; every abstraction is traceable to lower-level hashes. *An
LLM climbs to think and descends to verify.* The "candidate Acts" at L5 are exactly the
pre-registration proposals of ADR-0001 — they live in the projection/imagination, never as a
candidate state in the ledger. Registering one turns it into a register.

## Attention is scarce, governed presence

The triangle:

```text
projection  = cheap and abundant
attention   = scarce and curated
consequence = admitted/activated through process
```

`doubted` is **not an error state**; it is a governed human handoff — *where the Lab asks for a
hand*. Doubt feeds attention; attention is never a silent drop and never a silent escalation.
Doubt arises when authority is missing, confidence is insufficient, budget is exceeded, an
adapter is unavailable, input is ambiguous, an evidence obligation cannot be met, the safety
tier requires review, or a loop/fanout would exceed its limit.

An attention object says enough for a human or model to act:

```json
{ "why": "...", "source_hash": "...", "process_id": "...", "missing_fields": [],
  "needed_authority": "...", "suggested_next_action": "...", "expires_or_recheck": "..." }
```

## How this binds to risk, automation, and the cathedral

- **Escalation surfaces as attention** (ADR-0002): when a process crosses a boundary it cannot
  cross autonomously, it raises attention rather than forcing the move.
- **Doubt preservation** (ADR-0002) is realized here: ambiguity becomes an attention object, not
  fake certainty.
- **The anti-cathedral watcher and the Day-8 livability test** (ADR-0002) *emit projections and
  attention* — non-renting canon and rising friction show up in `lab_attention_index`, so the
  doctrine is visible, not merely asserted.

## Decision (the laws this record sets)

1. **Projections are eyes, not truth** — non-authoritative, rebuildable, citing `input_hashes`;
   the ledger always wins.
2. **Stable projections are deterministic maps** for orientation, never for irreversible decisions.
3. **Dynamic projections are pinned ladders, not blobs** — climb to think, descend to verify;
   every rung cites the rung below; L5 candidate Acts are pre-registration proposals.
4. **Attention is scarce governed presence** — projection abundant, attention scarce,
   consequence governed.
5. **Doubt is a handoff, not an error** — it produces a structured attention object; never a
   silent drop or silent escalation.

## What exists vs. what remains

- **Exists:** `lab/projections.py` implements `project_build` with `class` (stable/dynamic),
  `projection_spec_hash`, `projection_version`, `authoritative:false`, `rebuildable:true`,
  `input_hashes`, `ladder_level` (L0–L5), and pin validation; `CURRENT_RUNNABLE_PROCESSES.md` is
  a generated stable projection; the runtime raises durable, idempotent doubts (`raise_doubt`,
  `DOUBT_REASONS`); `attention-raise.v1` is a registered contract.
- **Remains (Day 4 and beyond):** the `lab_attention_index` stable projection; the **attention
  object** as a first-class registered shape (the JSON above); dynamic-projection *descend/verify*
  tooling across the ladder; the dynamic "garden" the roadmap describes.

## Open reconciliations

1. The `did` family for attention objects (e.g. `attention`) and their closure/expiry process.
2. How `ladder_level` rungs cite each other's `content_hash` concretely (parent links).
3. Reconcile any additional Universal Inbox v4/v5 detail beyond §14/§15 if it surfaces.

## Status

`registered` / accepted. With ADR-0001 and ADR-0002 this completes the doctrine corpus —
*form, governance, perception*. Supersede only by a later `did=decision` receipt citing this
record's hash, never by edit-in-place.
