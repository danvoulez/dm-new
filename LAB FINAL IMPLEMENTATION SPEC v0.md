# **LAB FINAL IMPLEMENTATION SPEC v0**

## **Fresh Ledger · Processual Runtime Tree · LLM/Dream Machine Partnership**

## **Status**

Implementation specification, v0.

This document defines the fresh rebuild of the Lab from the current canon and source audit.

It is not a brainstorming note.  
 It is not a parallel architecture.  
 It is the implementation path for the new Lab.

## **Core source basis**

Primary sources:

1\. Universal Inbox v3 / Awakening Layer  
   Source: 03\_UNIVERSAL\_INBOX\_V3.md  
   Role: processual wake law, frequency/wake-spec model, receiver law.

2\. Current design-session context  
   Source: Pasted text(17).txt  
   Role: runtime-tree consolidation, projection v4, Dream Machine boundary, LLM builder doctrine.

3\. LogLine Foundation  
   Source: fontes-dm.zip::Meu-Lab/external/LogLine-Foundation/  
   Role: receipt canon, conformance, JCS/RFC8785, tuple/content/envelope hash law.

4\. Meu-Lab canon  
   Source: fontes-dm.zip::Meu-Lab/  
   Role: Lab naming, process doctrine, activation states, clock, projection, attention, Dream Machine integration.

5\. CLI source  
   Source: fontes-dm.zip::cli/  
   Role: current Rust writer, clock, queue, executor, send/register/mine/wake commands.

6\. Database migrations  
   Source: fontes-dm.zip::ActGraph/migrations/ and fontes-dm.zip::Meu-Lab/migrations/  
   Role: current ledger DDL, generated columns, envelope boundary, realtime publication, legacy lab\_log removal.

7\. Projections source  
   Source: fontes-dm.zip::projections/  
   Role: existing Mongo projection implementation and non-authority model.

8\. Dream Machine implementation pack  
   Source: fontes-dm.zip::DDMM/  
   Role: Dream Machine as self-auditing imagination engine, candidate/proposal output, invariants.  
---

# **0\. Implementation objective**

Build a fresh Lab with:

one canonical ledger: public.logline\_acts  
one receipt canon: logline.receipt.v0  
one processual root law  
one runtime tree  
few resident services  
many process contracts  
many adapters  
rebuildable projections  
LLM/Dream Machine as proposal engines  
three physical computers as the situated body

The build must preserve the canon:

Everything may register.  
Only complete records matching registered process contracts activate.

Processes do not own runtimes.  
Processes own contracts, rituals, authority scopes, adapters, budgets, and evidence obligations.

Clock and receiver are selectors only.  
Queue is a rebuildable execution projection.  
Executor is the only governed dispatcher.  
Adapters are dumb leaves.  
Ledger records every transition.  
Mongo/projections are non-authoritative.  
LLMs and Dream Machine think, synthesize, and propose; they do not directly create consequence.  
---

# **1\. Non-negotiable implementation decisions**

## **1.1**

## **`logline_acts`**

## **is the only fresh ledger**

The fresh Lab uses:

public.logline\_acts

not:

public.lab\_log

`lab_log` is legacy/archive only.

Grounding:

ActGraph/migrations/0001\_logline\_acts.sql:1-52  
Meu-Lab/migrations/2026-06-21\_drop\_legacy\_lab\_log.sql:1-41  
projections/README.md:21-28

Implementation consequence:

No fresh service writes to lab\_log.  
No fresh projection treats lab\_log as custody.  
No fresh receiver listens to lab\_log.  
No fresh trigger is built on lab\_log.

The v3 law is preserved, but the implementation surface is upgraded:

v3 old surface: lab\_log \+ data.if\_ok  
fresh surface: logline\_acts \+ canonical if\_ok slot

## **1.2 Receipt truth lives in**

## **`act jsonb`**

The table stores the full receipt in `act`.

Projected/generated columns are convenience only.

Grounding:

ActGraph/migrations/0001\_logline\_acts.sql:3-8  
ActGraph/migrations/0001\_logline\_acts.sql:15-29  
ActGraph/migrations/0003\_tuple\_as\_generated\_columns.sql:13-27

Implementation consequence:

Writers mint a canonical receipt.  
DB stores act jsonb as truth.  
DB generated columns expose who/did/this/when/confirmed\_by/if\_ok/if\_doubt/if\_not/status/aux.  
No writer manually sets generated slot columns.

## **1.3 Addressing uses canonical**

## **`if_ok`**

Fresh addressing uses the receipt slot:

if\_ok

not `data.if_ok`.

Current CLI and `lab mine` already query the generated `if_ok` column.

Grounding:

cli/src/main.rs:3580-3675  
cli/src/main.rs:3845-3868  
ActGraph/migrations/0003\_tuple\_as\_generated\_columns.sql:19

Implementation consequence:

An addressed row names frequencies/hashes in canonical if\_ok.  
Receiver and mine read if\_ok.  
v3 data.if\_ok is treated as historical language from the old lab\_log design.

## **1.4 Transport/envelope is not receipt content**

Transport metadata does not live inside the receipt.

It belongs beside the receipt at the boundary.

Grounding:

ActGraph/migrations/0004\_envelope\_at\_the\_boundary.sql:1-20  
LogLine-Foundation/conformance/README.md:47-72  
LogLine-Foundation/conformance/tools/verify-receipt.mjs:39-58

Implementation consequence:

Top-level transport is forbidden in logline.receipt.v0.  
Top-level result is forbidden.  
Top-level evidence is forbidden.

Results and evidence are new records.  
Transport belongs to row-level envelope columns or wrapper.

## **1.5**

## **`lab emit`**

## **is legacy-compatible, not primary**

Fresh canonical commands are:

lab act  
lab register  
lab send  
lab schedule  
lab evaluate

`lab emit` may remain as a compatibility bridge, but must not be the primary fresh path.

Grounding:

cli/src/main.rs:3332-3384  
cli/src/main.rs:479-485

Implementation consequence:

Membrane/doors must use lab send or lab act.  
New docs should not teach lab emit as the canonical path.  
Eventually deprecate or rename lab emit as lab legacy-emit.

## **1.6 Receiver must become selector-only**

Current receiver still directly executes deterministic wakes.

Target receiver must only:

hear insert  
resolve addressed frequency/hash  
resolve wake/process registration  
evaluate or queue work  
write selection/queued receipt

Grounding:

cli/receiver/listen.mjs:1-22  
cli/receiver/listen.mjs:91-127

Implementation consequence:

Move deterministic execution behind executor adapter.  
Move inference behind executor adapter.  
Receiver never calls execFileSync for final effects.  
Receiver never calls models.  
Receiver never calls Devin.  
Receiver never sends final external notification.

## **1.7 Executor must become generic dispatcher**

Current executor starts a Devin CLI session directly.

Target executor dispatches by process contract and adapter.

Grounding:

cli/src/main.rs:2164-2276  
15\_LAB\_CLOCK.md:76-94

Implementation consequence:

route\_to\_devin becomes one adapter.  
Executor is not Devin-specific.  
All adapter classes pass through the same authority/budget/evidence gate.  
---

# **2\. Repository layout**

Fresh root:

Lab/  
  GENESIS.md  
  LAB\_TOPOLOGY.md  
  FOLDER\_STATUS.yml  
  VOCABULARY.md  
  LEGACY\_BOUNDARY.md  
  MACHINE\_REGISTRY.md  
  SERVICE\_ALLOWLIST.md  
  BOOTSTRAP\_LOG.md

  foundation/  
    LogLine-Foundation/

  docs/  
    REGISTER\_DOCTRINE.md  
    ACTIVATION\_STATES.md  
    FIELD\_COMPLETION\_RULES.md  
    PROCESS\_RUNTIME\_SPEC.md  
    PROJECTION\_DOCTRINE.md  
    DREAM\_MACHINE\_TENANT.md  
    LLM\_BUILDER\_PLAN.md

  cli/  
    Cargo.toml  
    src/  
    tests/

  runtime/  
    receiver/  
    clock/  
    executor/  
    adapters/

  processes/  
    PROCESS\_CONTRACT\_TEMPLATE.yml  
    PROCESS\_CATALOG.md  
    CURRENT\_RUNNABLE\_PROCESSES.md  
    memory-register.v1.yml  
    attention-raise.v1.yml  
    projection-build.v1.yml  
    evidence-closure.v1.yml  
    inference.v1.yml  
    notification.v1.yml  
    route-to-devin.v1.yml  
    github-check.v1.yml  
    worker-run.v1.yml  
    workflow-run.v1.yml

  schemas/  
    logline/  
    process/  
    runtime/  
    projection/  
    llm/  
    dream-machine/

  projections/  
    scripts/  
    schemas/  
    reports/

  dream-machine/  
    README.md  
    schemas/  
    prompts/  
    contracts/  
    src/

  workbench/  
    views/  
    tasks/  
    stage-cards/

  fleet/  
    machines/  
    services/  
    physical-evidence/

  tests/  
    conformance/  
    fixtures/  
    e2e/

Rules:

foundation/ is pinned upstream canon/conformance.  
docs/ contains local Lab doctrine.  
processes/ contains machine-readable process contracts.  
runtime/ contains selector/executor/adapter implementation.  
projections/ contains rebuildable maps, not truth.  
dream-machine/ is a tenant, not the Lab itself.  
---

# **3\. Fresh ledger implementation**

## **3.1 Table**

Use `public.logline_acts`.

Required columns:

content\_hash    text primary key check (content\_hash \~ '^\[0-9a-f\]{64}$')  
tuple\_hash      text not null check (tuple\_hash \~ '^\[0-9a-f\]{64}$')  
receipt\_version text not null  
act             jsonb not null  
inserted\_at     timestamptz not null default now()

Required constraints:

act-\>\>'id' \= content\_hash  
act-\>'hashes'-\>\>'tuple\_hash' \= tuple\_hash  
act-\>\>'receipt\_version' \= receipt\_version

Required discipline:

append-only  
UPDATE blocked  
DELETE blocked  
RLS enabled  
only gate/CLI service role writes

Grounding:

ActGraph/migrations/0001\_logline\_acts.sql:15-52

## **3.2 Generated columns**

Generated columns:

who          text generated always as (act-\>\>'who') stored  
did          text generated always as (act-\>\>'did') stored  
this         text generated always as (act-\>\>'this') stored  
"when"       text generated always as (act-\>\>'when') stored  
confirmed\_by text generated always as (act-\>\>'confirmed\_by') stored  
if\_ok        text generated always as (act-\>\>'if\_ok') stored  
if\_doubt     text generated always as (act-\>\>'if\_doubt') stored  
if\_not       text generated always as (act-\>\>'if\_not') stored  
status       text generated always as (act-\>\>'status') stored  
aux          jsonb generated always as (  
  act \- canonical/reserved fields  
) stored

Grounding:

ActGraph/migrations/0003\_tuple\_as\_generated\_columns.sql:13-34

Implementation requirement:

Do not write these manually.  
Do index who/did/this/when/status/aux.

## **3.3 Envelope columns**

Optional row-level envelope columns:

envelope\_hash text null  
sent\_by       text null  
sent\_to       text null  
sent\_at       text null  
channel       text null

Grounding:

ActGraph/migrations/0004\_envelope\_at\_the\_boundary.sql:1-20

Implementation requirement:

Do not put transport inside act.  
Use envelope columns or explicit envelope wrapper only.

## **3.4 Realtime**

Enable `logline_acts` in Supabase realtime publication.

Grounding:

ActGraph/migrations/0007\_realtime\_publication.sql:1-13

Principle:

The row is durable event.  
Realtime is bell.  
Realtime payload is never the only copy.  
Receiver always reads ledger.

## **3.5 Legacy boundary**

Do not create `lab_log`.

If importing old material, import it as archive/corpus material, not live custody.

Grounding:

Meu-Lab/migrations/2026-06-21\_drop\_legacy\_lab\_log.sql:6-20  
projections/README.md:21-28  
---

# **4\. Receipt canon implementation**

## **4.1 Required receipt mold**

`logline.receipt.v0` fields:

{  
  "id": "hashes.content\_hash",  
  "receipt\_version": "logline.receipt.v0",  
  "who": "",  
  "did": "",  
  "this": "",  
  "when": "",  
  "confirmed\_by": "",  
  "if\_ok": "",  
  "if\_doubt": "",  
  "if\_not": "",  
  "status": "",  
  "hashes": {  
    "tuple\_hash": "",  
    "content\_hash": "",  
    "algorithm": "sha256"  
  },  
  "json\_canonicalization": "jcs-rfc8785"  
}

Grounding:

LogLine-Foundation/canon/logline.receipt.v0:1-19

## **4.2 Hash rules**

tuple\_hash    \= sha256(jcs(9 slots))  
content\_hash  \= sha256(jcs(receipt except id and hashes))  
envelope\_hash \= sha256(jcs({content, transport}))

Grounding:

LogLine-Foundation/conformance/README.md:47-58  
cli/src/main.rs:369-455

## **4.3 JCS rule**

Use RFC8785 canonical JSON.

Do not use `serde_json::to_string` or `JSON.stringify` for hash material.

Production Rust should use `serde_jcs`.

Grounding:

LogLine-Foundation/conformance/hash-profiles/jcs-rfc8785.md:1-64  
cli/src/main.rs:339-345

## **4.4 Forbidden top-level fields**

Receipts must not contain top-level:

result  
evidence  
transport

Grounding:

LogLine-Foundation/conformance/README.md:60-72  
LogLine-Foundation/conformance/tools/verify-receipt.mjs:39-107  
cli/src/main.rs:420-444

Implementation consequence:

Execution outcomes are separate records.  
Evidence is separate record/store.  
Transport belongs to envelope boundary.

## **4.5 Conformance**

Build step must run:

node foundation/LogLine-Foundation/conformance/tools/verify-receipt.mjs \--suite

Acceptance:

All valid vectors pass.  
All invalid vectors fail.  
Engine-generated receipts verify under Foundation verifier.

Grounding:

LogLine-Foundation/conformance/README.md:90-97  
---

# **5\. CLI implementation**

## **5.1 Existing substrate to keep**

Keep:

content\_hash via serde\_jcs \+ sha256  
canonical\_receipt  
act\_row  
write\_act\_row  
lab act  
lab send  
lab register  
lab mine  
lab wake-spec  
lab wake-handled  
lab wake-receipt  
lab schedule  
lab clock  
lab queue  
lab executor

Grounding:

cli/src/main.rs:339-477  
cli/src/main.rs:3580-3675  
cli/src/main.rs:3798-3868

## **5.2 Required command surface**

### **Memory/receipt commands**

lab act ...  
lab register ...  
lab read ...  
lab cite \<hash\>  
lab inspect \<hash\>  
lab hash \<json-file\>  
lab status  
lab doctor

### **Addressing/wake commands**

lab send \<did\> \<this\> \--to \<hash\>\[,\<hash\>\] \--data \<json\>  
lab mine \<frequency\> \[limit\]  
lab wake-spec \<frequency\>  
lab wake-handled \<source\_hash\>  
lab wake-receipt \<source\_hash\> ...

### **Process/runtime commands**

lab evaluate \<hash\> \[--process \<process\_id\>\]  
lab queue add \<hash\>  
lab queue list  
lab queue inspect \<queue\_id\>  
lab queue claim  
lab queue release  
lab queue close  
lab clock tick  
lab clock daemon  
lab clock backfill  
lab executor run  
lab executor daemon

### **Projection/LLM commands**

lab project all  
lab project build \<projection\_spec\>  
lab project inspect \<projection\_hash\>  
lab project descend \<projection\_hash\>  
lab infer \<task\> \--model \<model\_id\> \--schema \<schema\_id\>

## **5.3**

## **`lab emit`**

Implementation status:

legacy-compatible bridge  
not primary command

Action:

Keep temporarily.  
Mark deprecated in VOCABULARY.md.  
Forbid use in new membrane/door docs.  
Add conformance warning when new scripts call lab emit.

Grounding:

cli/src/main.rs:3332-3384  
---

# **6\. Process contracts**

## **6.1 Process doctrine**

Root law:

The Lab registers everything, but processes only complete records.

Grounding:

Meu-Lab/09\_processes/lab/REGISTER\_DOCTRINE.md:1-13

Processing requires:

1\. Matches current process contract.  
2\. Required slot rules pass.  
3\. Required AUX fields exist.  
4\. Target infrastructure is available.  
5\. Idempotency rule passes.

Grounding:

Meu-Lab/09\_processes/lab/REGISTER\_DOCTRINE.md:39-49

## **6.2 Canonical process lifecycle**

States:

registered  
incompleto  
completável  
ativável  
processando  
fechado

Grounding:

Meu-Lab/09\_processes/lab/ACTIVATION\_STATES.md:5-14

Definitions:

registered  \= admitted memory, no evaluation  
incompleto  \= missing required fields  
completável \= required fields exist, infra not checked  
ativável    \= complete and infra available  
processando \= infrastructure/effect in flight  
fechado     \= terminal closure/evidence

Grounding:

Meu-Lab/09\_processes/lab/ACTIVATION\_STATES.md:18-59

Important:

inert is not lifecycle state; it is a property.  
doubted is transition/handoff path.

Grounding:

Meu-Lab/09\_processes/lab/ACTIVATION\_STATES.md:61-89

## **6.3 Field completion levels**

Process contracts reference completion levels, not just booleans.

Examples:

who.weak  
who.authenticated  
who.signed  
who.authorized

did.descriptive  
did.compatible  
did.canonical

this.descriptive  
this.addressable  
this.canonical

Grounding:

Meu-Lab/09\_processes/lab/FIELD\_COMPLETION\_RULES.md:1-82

Implementation consequence:

lab evaluate computes field completion levels.  
Process contracts declare required levels.

## **6.4 Process contract schema**

Required fields:

process\_id: activate.\<name\>.v1  
title:  
status: active|draft|experimental|deprecated  
kind:  
version:  
owner:  
process\_class: content|envelope|effect|evidence|projection  
wakes:  
requires\_infra:  
composable: true|false  
requires\_target\_hash: true|false  
idempotency: required|optional|none  
evidence\_required: true|false

activation\_ritual:  
  required\_slots:  
    who: who.authorized  
    did: did.canonical  
    this: this.canonical  
    when: when.registered\_at  
    confirmed\_by: confirmed\_by.evidence\_hash  
    if\_ok: if\_ok.compatible  
    if\_doubt: if\_doubt.compatible  
    if\_not: if\_not.compatible  
    status: status.registered  
  required\_aux:  
    \- process  
    \- idempotency\_key  
  optional\_aux: \[\]

authority\_scope:  
  allowed\_who: \[\]  
  required\_grants: \[\]

adapter:  
  name:  
  danger\_tier:

budget\_policy:  
  acu\_limit:  
  timeout\_seconds:  
  rate\_limit:

evidence\_obligation:  
  required: true  
  must\_include: \[\]

closure\_shape:  
  success\_status: fechado  
  doubt\_status: doubted  
  ghost\_status: ghost

if\_doubt:  
  behavior: attention\_raise|freeze|ask\_human|retry\_later

runtime\_readiness:  
  checks: \[\]

examples:  
  valid: \[\]  
  incomplete: \[\]

## **6.5 Initial process set**

From existing catalog and target build:

activate.memory\_register.v1  
activate.attention\_raise.v1  
activate.projection\_build.v1  
activate.evidence\_closure.v1  
activate.inference.v1  
activate.notification.v1  
activate.route\_to\_devin.v1  
activate.github\_check.v1  
activate.worker\_run.v1  
activate.workflow\_run.v1  
activate.manual\_review.v1  
activate.process\_contract\_update.v1  
activate.vocabulary\_drift\_report.v1  
activate.runtime\_readiness\_report.v1

Grounding:

Meu-Lab/09\_processes/lab/PROCESS\_CATALOG.md:1-71

## **6.6 Immediate contradiction to fix**

`route_to_devin` is current.

`devin_session` is deprecated but still has `status: active` in front matter and appears in current runnable processes.

Grounding:

Meu-Lab/09\_processes/lab/processes/route-to-devin.v1.md:21-37  
Meu-Lab/09\_processes/lab/processes/route-to-devin.v1.md:135-137  
Meu-Lab/09\_processes/lab/processes/devin-session.v1.md:1-25  
Meu-Lab/09\_processes/lab/CURRENT\_RUNNABLE\_PROCESSES.md:1-46

Implementation task:

Set devin-session.v1.md status: deprecated.  
Remove it from generated runnable list.  
Make lab evaluate refuse new activation against deprecated process unless \--legacy.  
Regenerate CURRENT\_RUNNABLE\_PROCESSES.md.  
---

# **7\. Evaluator implementation**

## **7.1 Command**

lab evaluate \<hash\> \[--process \<process\_id\>\] \[--json\]

## **7.2 Inputs**

target hash  
receipt row from logline\_acts  
all process contracts  
field completion rules  
runtime readiness checks  
idempotency index  
authority/grant registry

## **7.3 Algorithm**

1\. Load row by content\_hash.  
2\. Extract receipt slots and aux.  
3\. If \--process provided, load that contract; else find candidate contracts by AUX.process, did, process\_class, or catalog matching.  
4\. Compute field completion levels.  
5\. Check required slots.  
6\. Check required AUX keys.  
7\. Check target\_content\_hash if required.  
8\. Check process status is active.  
9\. Check infra readiness.  
10\. Check idempotency.  
11\. Check authority scope and grants if dangerous.  
12\. Return activation state.  
13\. Optionally write evaluation receipt.

## **7.4 Output shape**

{  
  "hash": "\<content\_hash\>",  
  "process\_id": "activate.projection\_build.v1",  
  "registration\_state": "registered",  
  "activation\_state": "ativável",  
  "matched": true,  
  "field\_levels": {  
    "who": "who.authorized",  
    "did": "did.canonical",  
    "this": "this.canonical"  
  },  
  "missing\_slots": \[\],  
  "missing\_aux": \[\],  
  "adapter": "projection\_build",  
  "danger\_tier": "L1",  
  "queueable": true,  
  "evidence\_required": true  
}

Incomplete example:

{  
  "hash": "\<content\_hash\>",  
  "process\_id": "activate.route\_to\_devin.v1",  
  "activation\_state": "incompleto",  
  "matched": true,  
  "missing\_aux": \["target\_content\_hash", "target\_process"\],  
  "queueable": false  
}

## **7.5 Acceptance tests**

Bad/vague record \-\> registered \+ incompleto/frozen, no queue.  
Complete projection\_build \-\> ativável.  
Deprecated devin\_session \-\> inert/deprecated, no activation.  
route\_to\_devin missing target\_content\_hash \-\> incompleto.  
route\_to\_devin complete \+ infra available \-\> ativável.  
Dangerous worker\_run without grant \-\> doubted or frozen, no run.  
---

# **8\. Queue implementation**

## **8.1 Queue nature**

Queue is local projection, not truth.

Grounding:

15\_LAB\_CLOCK.md:64-75

Existing implementation writes both:

queued ledger receipt  
local \~/.lab/queue/\<timestamp\>-\<hash\>.json

Grounding:

cli/src/main.rs:1927-2056

## **8.2 Required commands**

lab queue add \<hash\> \--process \<process\_id\>  
lab queue list  
lab queue inspect \<queue\_id\>  
lab queue claim  
lab queue release  
lab queue close  
lab queue rebuild \--from \<time\> \--to \<time\>

## **8.3 Queue item shape**

{  
  "queue\_id": "\<hash or deterministic id\>",  
  "source\_hash": "\<content\_hash\>",  
  "queued\_at": "\<UTC\>",  
  "process\_id": "activate.projection\_build.v1",  
  "adapter": "projection\_build",  
  "idempotency\_key": "...",  
  "box": "lab-256",  
  "state": "queued"  
}

## **8.4 Ledger transition**

Every queue insertion writes a receipt:

did \= queued  
this \= source\_hash  
status \= queued  
AUX.original\_hash  
AUX.process\_id  
AUX.adapter  
AUX.idempotency\_key  
AUX.box

## **8.5 Rebuild**

Queue can be rebuilt from:

scheduled Acts  
queued receipts  
unclosed processando receipts  
idempotency state  
box affinity

## **8.6 Acceptance tests**

queue file deletion \+ rebuild restores due work.  
queue add writes ledger receipt.  
queue does not mutate original Act.  
duplicate idempotency key does not queue twice.  
---

# **9\. Clock selector**

## **9.1 Role**

Clock selects due scheduled records.

It does not execute.

Grounding:

15\_LAB\_CLOCK.md:3-29

## **9.2 Existing implementation**

Current code queries hardcoded `did` set and `status=scheduled`.

Grounding:

cli/src/main.rs:1890-1915

## **9.3 Target implementation**

Replace hardcoded due process list with process-contract-based selection.

Algorithm:

1\. Get UTC now.  
2\. Query logline\_acts where status=scheduled and when \<= now.  
3\. Filter by box affinity.  
4\. Evaluate each candidate.  
5\. If activatable or completável for scheduled envelope, queue.  
6\. Write queued receipt.  
7\. Do not execute.

## **9.4 Commands**

lab clock tick  
lab clock daemon  
lab clock backfill \--from \<time\> \--to \<time\>  
lab clock now

## **9.5 Acceptance tests**

Scheduled complete record \-\> queued.  
Scheduled incomplete record \-\> incompleto/ghost/attention, not executed.  
Clock tick creates queued receipt, not effect.  
Clock daemon does not call adapters directly.  
---

# **10\. Realtime receiver selector**

## **10.1 Role**

Receiver selects by realtime citation/frequency/hash.

It does not execute.

The v3 principle remains: the message triggers; the registration governs.

## **10.2 Existing source**

Current receiver:

subscribes to logline\_acts INSERT  
loads frequencies  
checks if\_ok contains one  
resolves aux.spec  
executes deterministic wake inline  
writes awakened receipt  
has catchUp path

Grounding:

cli/receiver/listen.mjs:1-22  
cli/receiver/listen.mjs:72-89  
cli/receiver/listen.mjs:91-127  
cli/receiver/listen.mjs:141-163

## **10.3 Target receiver**

Replace `dispatch()` execution with `selectAndQueue()`.

Algorithm:

1\. On INSERT payload, read new row.  
2\. Check if if\_ok names any local frequency.  
3\. For each matching frequency:  
   a. Resolve frequency record from logline\_acts.  
   b. Read aux.spec / process / wake declaration.  
   c. Refuse no spec by writing selection-doubted or attention record.  
   d. Create a process envelope record or queue item citing source\_hash and frequency.  
   e. Let executor handle deterministic/inference/notification/worker/workflow.  
4\. On reconnect, catch up by querying if\_ok for local frequencies.  
5\. Use idempotency from ledger receipts.

## **10.4 Output**

Receiver should write:

did \= selected  
or did \= queued  
or did \= wake\_selected  
this \= source\_hash  
if\_ok \= executor/process frequency if applicable  
status \= queued|doubted  
AUX.freq  
AUX.source\_hash  
AUX.wake\_spec\_hash  
AUX.process\_id  
AUX.reason

Do not write final `awakened` result from receiver except possibly legacy compatibility.

## **10.5 Migrations**

Current wake statuses:

closed  
refused  
failed

Target process vocabulary:

fechado  
doubted  
ghost  
inert

Action:

Keep old statuses as legacy wake-receipt outcomes.  
For fresh process lifecycle, use registered/incompleto/completável/ativável/processando/fechado/doubted.  
Add LEGACY\_STATUS\_MAP.md.

## **10.6 Acceptance tests**

Inserted Act naming local frequency creates queued work.  
Receiver does not call execFileSync.  
Receiver does not call model.  
Receiver catchUp queues missed taps.  
Duplicate tap does not queue duplicate work.  
No wake spec \-\> doubted/attention, not silent failure.  
---

# **11\. Executor dispatcher**

## **11.1 Role**

Executor is the sole governed dispatcher.

## **11.2 Existing source**

Current executor directly starts Devin.

Grounding:

cli/src/main.rs:2164-2276

Existing useful pieces:

reads local queue file  
honors \~/.lab/PAUSE  
checks ACU budget  
writes/handles budget exhaustion ghost  
removes queue item after run

Grounding:

cli/src/main.rs:2164-2276

## **11.3 Target dispatcher algorithm**

1\. Claim next queue item.  
2\. Load source Act.  
3\. Load requested process contract.  
4\. Run lab evaluate.  
5\. If not activatable:  
   a. write incompleto/doubted/ghost receipt  
   b. do not dispatch adapter  
6\. Check service pause.  
7\. Check authority scope.  
8\. Check grants for dangerous tier.  
9\. Check budget.  
10\. Check runtime readiness.  
11\. Write processando receipt.  
12\. Dispatch adapter.  
13\. Validate adapter output.  
14\. Write fechado/doubted/ghost/evidence receipt.  
15\. Remove or close queue item.  
16\. Update projections asynchronously or queue projection\_build.

## **11.4 Dispatcher interface**

Internal Rust trait or equivalent:

trait Adapter {  
    fn name(\&self) \-\> &'static str;  
    fn danger\_tier(\&self) \-\> DangerTier;  
    fn dry\_run(\&self, job: AdapterJob) \-\> AdapterResult;  
    fn run(\&self, job: AdapterJob) \-\> AdapterResult;  
}

Adapter job:

{  
  "source\_hash": "...",  
  "process\_id": "...",  
  "process\_contract\_hash": "...",  
  "queue\_id": "...",  
  "authority\_context": {},  
  "budget\_context": {},  
  "evidence\_obligation": {},  
  "aux": {}  
}

Adapter result:

{  
  "status": "fechado|doubted|ghost",  
  "output\_summary": "...",  
  "evidence": {},  
  "candidate\_acts": \[\],  
  "projection\_requests": \[\],  
  "attention\_objects": \[\]  
}

## **11.5 Evidence obligation**

Every adapter result must satisfy the process contract’s evidence obligation.

If evidence is missing:

executor writes doubted  
adapter result is not treated as fechado

## **11.6 Acceptance tests**

Executor dispatches memory\_register adapter.  
Executor dispatches projection\_build adapter.  
Executor refuses worker\_run without grant.  
Executor maps budget exhaustion to doubted/ghost.  
Executor writes processando before effect.  
Executor writes fechado only after evidence obligation passes.  
Executor never starts Devin unless route\_to\_devin adapter selected.  
---

# **12\. Adapter implementation**

## **12.1 Adapter classes**

Initial adapter registry:

none / memory  
attention\_raise  
projection\_build  
evidence\_closure  
inference  
notification  
route\_to\_devin  
github\_check  
worker\_run  
workflow\_run

## **12.2 Danger tiers**

L0 memory / locate  
L1 projection / attention / dry-run notification  
L2 deterministic allowlisted local command  
L3 inference schema-caged model call  
L4 worker\_run registered code artifact  
L5 workflow\_run registered graph

## **12.3 Adapter rules**

Adapters:

do not self-authorize  
do not inspect global policy except as passed context  
do not create process state directly except through executor-returned result  
do not silently retry  
do not escalate to another adapter  
do not write Mongo as truth  
do not mutate original Act

## **12.4 Foundation adapter conformance**

Import adapter cases from Foundation:

adapter\_must\_not\_redefine\_canon  
external\_input\_becomes\_logline\_candidate  
transport\_invokes\_runtime\_without\_judging  
release\_requires\_if\_ok  
if\_doubt\_no\_mutation  
receipt\_proves\_scope  
technical\_failure\_is\_not\_automatic\_if\_not  
projection\_does\_not\_redefine\_protocol

Grounding:

LogLine-Foundation/conformance/cases/adapter-cases.json

## **12.5 Adapter order**

Implement in this order:

1\. memory\_register  
2\. attention\_raise  
3\. projection\_build  
4\. evidence\_closure  
5\. inference dry-run  
6\. inference real  
7\. notification dry-run  
8\. notification real  
9\. github\_check read-only  
10\. route\_to\_devin dry-run  
11\. route\_to\_devin real  
12\. worker\_run  
13\. workflow\_run  
---

# **13\. Authority, grants, budget**

## **13.1 Authority scope**

Each process contract declares:

authority\_scope:  
  required\_who\_level: who.authorized  
  allowed\_actors:  
    \- dan  
    \- lab-capital  
  required\_confirmed\_by:  
    \- human\_confirmation  
    \- signature

## **13.2 Grants**

Dangerous adapters require registered grants.

Grant record fields:

{  
  "grant\_id": "...",  
  "adapter": "worker\_run",  
  "process\_id": "activate.worker\_run.v1",  
  "granted\_by": "dan",  
  "granted\_to": "lab-512",  
  "valid\_until": "...",  
  "acu\_limit": 10,  
  "timeout\_seconds": 300,  
  "fs\_scope": "...",  
  "network\_policy": "none|restricted|open",  
  "fanout\_limit": 0,  
  "depth\_limit": 0,  
  "evidence\_required": true  
}

## **13.3 Budget**

Reuse existing budget guard logic, but generalize from Devin to all adapters.

Grounding:

cli/src/main.rs:2215-2225

Rules:

Each adapter declares ACU cost.  
Executor checks budget before dispatch.  
Budget exhaustion writes doubted/ghost/attention.  
No silent drop.

## **13.4 Acceptance tests**

worker\_run without grant \-\> no execution.  
workflow\_run without depth/fanout budget \-\> no execution.  
budget exhaustion creates attention/doubt record.  
grant expiry prevents dispatch.  
---

# **14\. Projection implementation**

## **14.1 Authority model**

Projection owns maps, not truth.

Grounding:

projections/README.md:1-28

Projection docs must include:

{  
  "authoritative": false,  
  "rebuildable": true,  
  "computed\_at": "...",  
  "projection\_version": "...",  
  "sources": \["..."\],  
  "input\_hashes": \["..."\]  
}

Grounding:

projections/MONGO\_PROJECTION\_IMPLEMENTATION\_REPORT.md:87-107

## **14.2 Existing implementation**

Current script implementation exists and wrote eight projection documents.

Collections:

lab\_current\_state  
lab\_current\_law  
lab\_rule\_graph  
lab\_ledger\_surfaces  
lab\_process\_index  
lab\_doc\_gaps  
lab\_weekly\_program  
lab\_ghosts\_and\_gaps

Grounding:

projections/MONGO\_PROJECTION\_IMPLEMENTATION\_REPORT.md:1-14  
projections/MONGO\_PROJECTION\_IMPLEMENTATION\_REPORT.md:61-73

## **14.3 Required extension**

Add:

{  
  "class": "stable|dynamic"  
}

For dynamic projections:

{  
  "class": "dynamic",  
  "pin": {  
    "model": "...",  
    "prompt": "...",  
    "params": {},  
    "seed": "..."  
  },  
  "projection\_spec\_hash": "...",  
  "parent\_projection\_hashes": \[\],  
  "ladder\_level": "L0|L1|L2|L3|L4|L5"  
}

## **14.4 Projection adapter**

`projection_build` adapter:

runs projection scripts  
validates output metadata  
writes projection receipt  
never treats Mongo as authority

## **14.5 Commands**

lab project all  
lab project build \<spec\>  
lab project inspect \<projection\_hash\>  
lab project descend \<projection\_hash\>  
lab project verify

## **14.6 Acceptance tests**

Projection rebuild produces identical docs from same inputs.  
Every doc has authoritative:false.  
Every doc has rebuildable:true.  
Every doc has input\_hashes.  
Dynamic projection without pin is rejected or marked candidate-only.  
Mongo deletion \+ rebuild restores projections.  
No infrastructure wakes from Mongo alone.  
---

# **15\. LLM inference implementation**

## **15.1 LLM role**

LLMs are thinking participants.

They do not create consequence directly.

## **15.2 Inference adapter**

All model calls go through executor adapter:

executor \-\> inference adapter \-\> model/membrane/local runtime \-\> schema output \-\> receipt

## **15.3 Required registries**

MODEL\_REGISTRY.md  
PROMPT\_REGISTRY.md  
SCHEMA\_REGISTRY.md  
LLM\_RECEIPT.v1.md

## **15.4 Inference request**

{  
  "task": "route\_inbound\_event",  
  "model\_id": "goblin-local",  
  "prompt\_id": "route\_inbound\_event.v1",  
  "schema\_id": "route\_decision.v1",  
  "input\_hashes": \["..."\],  
  "projection\_hashes": \["..."\],  
  "params": {  
    "temperature": 0  
  }  
}

## **15.5 LLM receipt**

{  
  "did": "llm.receipt",  
  "this": "\<inference\_request\_hash\>",  
  "status": "fechado",  
  "model\_id": "...",  
  "prompt\_hash": "...",  
  "schema\_hash": "...",  
  "input\_hashes": \["..."\],  
  "projection\_hashes": \["..."\],  
  "output\_hash": "...",  
  "schema\_valid": true,  
  "citations\_valid": true  
}

## **15.6 Output classes**

LLM outputs may become:

candidate Act  
attention object  
dynamic projection rung  
summary/classification

They may not:

execute code  
send email  
call Devin  
mutate canon  
mutate Mongo as authority

## **15.7 Acceptance tests**

Schema-valid output \-\> LLM receipt fechado.  
Schema-invalid output \-\> doubted.  
Uncited claim \-\> doubted.  
Model output requesting execution \-\> candidate only, no effect.  
External model call refused unless run envelope allows it.  
---

# **16\. Dream Machine tenant implementation**

## **16.1 Boundary**

Dream Machine may:

ingest  
classify  
compare  
simulate  
synthesize  
propose

Dream Machine may not become authority.

Grounding:

DDMM/README.md:1-13  
DDMM/DREAM\_MACHINE\_IMPLEMENTATION\_SPEC.md:36-46

## **16.2 Identity**

Dream Machine is:

self-auditing imagination engine for living systems

Grounding:

DDMM/DREAM\_MACHINE\_IMPLEMENTATION\_SPEC.md:8-46

## **16.3 Design laws to import**

From DDMM:

material is not semantic truth  
canonicality is a judged projection  
no claim without evidence  
no fake final answer  
dreaming requires machine trail  
patch proposals are candidates  
private corpus first  
secrets never enter embeddings  
UI is not ledger  
rebuildability

Grounding:

DDMM/DREAM\_MACHINE\_IMPLEMENTATION\_SPEC.md:79-120

## **16.4 Enforced invariants**

Import DDMM invariants:

write confinement  
deterministic material IDs  
no claim without evidence  
referential evidence  
no semantic authority by display  
external model boundary  
UTC timestamp convention

Grounding:

DDMM/INVARIANTS.md:1-71

## **16.5 Integration**

Dream Machine outputs must enter Lab as:

candidate Acts  
proposal Acts  
attention objects  
dynamic projection rungs  
drift reports

Dream Machine does not directly:

activate process  
mutate canon  
run code  
call external effects

## **16.6 Commands**

dream scan  
dream extract  
dream mine  
dream judge  
dream synthesize  
dream propose  
dream verify

Lab wrapper:

lab dream ingest \<corpus\>  
lab dream propose \<question\>  
lab dream register-candidate \<output\_hash\>

## **16.7 Acceptance tests**

From DDMM acceptance family:

No source mutation.  
Rebuildable material DB.  
No claim without evidence.  
Material is not truth.  
Contradiction not resolved silently.  
Patch proposal is candidate material.  
Secret redaction.  
External model boundary.  
Canonical map cites sources.  
Drift produces Ghost/candidate path.  
---

# **17\. Agent communication implementation**

## **17.1 Agent entity**

Agent registration includes:

{  
  "kind": "agent|person|llm|code|workflow|machine",  
  "wake": {  
    "mode": "process",  
    "process\_id": "activate.inference.v1"  
  },  
  "resident\_on": "lab-512",  
  "allowed\_processes": \[\],  
  "attention\_path": "...",  
  "receipt\_shape": "..."  
}

## **17.2 Frequency**

An entity frequency is the content hash of its registration/wake-spec.

Grounding inherited from Universal Inbox v3 and current `lab register`.

Implementation source:

cli/src/main.rs:3798-3844

## **17.3 Communication flow**

Act names frequency in if\_ok  
receiver detects insert  
receiver queues wake/process work  
executor evaluates process contract  
adapter runs if allowed  
receipt/evidence written  
projection updates

## **17.4 Acceptance tests**

Act citing agent frequency queues work.  
Agent without wake spec becomes doubted, not executed.  
Agent output is receipt/candidate/attention.  
Agent cannot run shell directly.  
---

# **18\. Workbench implementation**

## **18.1 Role**

Workbench guides Dan.

It does not become authority.

## **18.2 Views**

current topology  
machine registry  
service allowlist  
process catalog  
current runnable processes  
queue  
executor status  
attention  
projections  
agents  
Dream Machine outputs  
next safe step

## **18.3 Writes**

Workbench may write:

candidate Acts  
manual review records  
attention resolutions  
process proposals  
operator notes

Workbench must not:

write Mongo as authority  
bypass CLI/gate  
execute effects directly  
---

# **19\. Fleet implementation**

## **19.1 Machine roles**

Register three machines as situated entities.

Roles:

workbench machine  
capital/custody machine  
inference/worker machine

## **19.2 Machine record**

machine\_id:  
hostname:  
role:  
operator\_account:  
lab\_root:  
deployed\_cli\_path:  
allowed\_services:  
allowed\_adapters:  
forbidden\_adapters:  
physical\_dependencies:  
last\_seen:  
evidence\_hashes:

## **19.3 Resident service allowlist**

Allowed resident classes:

receiver  
clock  
executor  
optional projection daemon  
approved maintenance  
system services

Forbidden:

one daemon per process  
one LaunchAgent per idea  
cron sprawl  
brew service sprawl  
hidden background scripts

## **19.4 Service records**

Each resident service must have:

service name  
machine  
binary/path  
env file  
logs  
restart policy  
purpose  
allowed process classes  
evidence/health check

## **19.5 Acceptance tests**

All machines registered.  
Services match allowlist.  
Unapproved LaunchAgent detected.  
Receiver/clock/executor run where assigned.  
Physical cable registered as evidence, not IaC.  
---

# **20\. Bootstrap sequence**

## **Phase 0 — Archive custody**

export old canon  
export old cli  
export projections  
export Dream Machine  
export database schema  
export fleet scans  
export keys/env inventory redacted  
export conversation/design archive  
seal old world archive

## **Phase 1 — First machine**

wipe  
install OS  
create operator account  
create Lab root  
install toolchain  
install Git/SSH identity  
create bootstrap repo  
write GENESIS.md  
write FOLDER\_STATUS.yml  
write VOCABULARY.md  
commit skeleton

## **Phase 2 — Foundation import**

import LogLine-Foundation  
pin version/hash  
run conformance suite  
generate local schemas/types

## **Phase 3 — Ledger genesis**

create fresh Supabase/project or DB  
apply logline\_acts DDL  
apply generated columns  
apply envelope columns  
enable realtime publication  
verify append-only triggers  
write genesis Acts

## **Phase 4 — CLI writer**

port canonical\_receipt writer  
port lab act/register/send/read/cite/hash/inspect/status/doctor  
disable new use of lab emit  
verify Foundation conformance

## **Phase 5 — Process doctrine**

write process template  
write activation states  
write field completion rules  
write first safe contracts  
write process catalog generator

## **Phase 6 — Evaluator**

implement lab evaluate  
run completion tests  
run deprecated-process tests  
run missing-AUX tests

## **Phase 7 — Queue and clock**

implement queue  
port clock  
make clock process-contract aware  
verify selector-only behavior

## **Phase 8 — Executor skeleton**

refactor executor into dispatcher  
preserve pause and budget guard  
add adapter registry  
add memory/projection/attention adapters

## **Phase 9 — Receiver purification**

port receiver  
remove inline execution  
emit queued/selection records  
add catchUp  
verify no execFileSync/model/Devin calls

## **Phase 10 — Projections**

port projection scripts  
add class stable/dynamic  
add pin for dynamic  
add projection\_build adapter  
add rebuild verification

## **Phase 11 — LLM/Dream Machine**

add model/prompt/schema registries  
add inference adapter  
add LLM receipts  
integrate DDMM as tenant  
ensure candidate-only consequence boundary

## **Phase 12 — Fleet**

wipe/register machines 2 and 3  
install CLI  
assign services  
deploy receiver/clock/executor  
verify service allowlist  
verify three-machine projections

## **Phase 13 — Controlled doors**

open notification real mode  
open GitHub read-only  
open route\_to\_devin dry-run  
open route\_to\_devin real  
keep worker\_run/workflow\_run closed until grants/budget/sandbox pass  
---

# **21\. Required generated files**

## **21.1**

## **`CURRENT_RUNNABLE_PROCESSES.md`**

Generated from:

process contracts  
infrastructure checks  
secret availability  
service status  
policy enablement  
grant availability

Must not be hand-edited.

Grounding:

Meu-Lab/09\_processes/lab/CURRENT\_RUNNABLE\_PROCESSES.md:1-8

## **21.2**

## **`LAB_TOPOLOGY.md`**

Generated or maintained from:

machine registry  
services  
source folders  
canonical/legacy status  
deployed copies  
projection locations

## **21.3**

## **`LEGACY_STATUS_MAP.md`**

Must map historical statuses:

admitted  
claimed  
closed  
refused  
failed  
candidate  
sent  
cancelled  
retired

to fresh lifecycle vocabulary where possible.

## **21.4**

## **`SOURCE_MANIFEST.md`**

Every major source classified as:

canon  
implementation-current  
implementation-legacy  
archive  
generated  
sample/evidence  
unknown  
---

# **22\. End-to-end acceptance tests**

## **22.1 Foundation conformance**

Foundation suite passes.  
Engine-generated receipt passes verifier.  
Forbidden top-level result/evidence/transport rejected.  
JCS hashes stable.

## **22.2 Ledger**

Insert canonical receipt.  
Generated columns match receipt.  
Update blocked.  
Delete blocked.  
Realtime INSERT observed.  
lab\_log absent or archive-only.

## **22.3 Registration**

Malformed/vague record registers.  
No activation occurs.  
Projection shows incomplete/frozen/inert.

## **22.4 Evaluation**

Complete projection\_build \-\> ativável.  
Missing required AUX \-\> incompleto.  
Deprecated devin\_session \-\> inert/deprecated.  
Dangerous worker\_run without grant \-\> doubted/no run.

## **22.5 Clock**

Due scheduled Act queues.  
Clock writes queued receipt.  
Clock never executes adapter.  
Queue rebuild works.

## **22.6 Receiver**

Realtime insert naming local frequency queues work.  
Catch-up finds missed rows.  
Receiver never executes.  
No wake spec \-\> attention/doubt.  
Duplicate tap idempotent.

## **22.7 Executor**

Executor dispatches memory adapter.  
Executor dispatches projection adapter.  
Executor writes processando before dispatch.  
Executor writes fechado only with evidence.  
Executor pauses under \~/.lab/PAUSE.  
Budget exhaustion creates doubt/ghost.

## **22.8 Projections**

Projection docs authoritative:false.  
Projection docs rebuildable:true.  
Input hashes present.  
Mongo deletion \+ rebuild works.  
Dynamic projection without pin rejected/candidate-only.

## **22.9 LLM**

Inference adapter calls model.  
Schema-valid output receipted.  
Schema-invalid output doubted.  
LLM output cannot execute.  
Candidate Act emitted.

## **22.10 Dream Machine**

No source mutation.  
No claim without evidence.  
Canonical map cannot claim truth without Act source.  
External model boundary enforced.  
Candidate proposals registered, not executed.

## **22.11 Fleet**

Three machines registered.  
Services allowlisted.  
Unapproved daemon detected.  
Roles projected.  
Physical dependencies recorded.  
---

# **23\. First alive milestones**

## **Milestone A — Lab Alive v0**

register \-\> evaluate \-\> queue \-\> executor \-\> projection\_build \-\> fechado \-\> projection visible

Adapter:

projection\_build

No external effects.

## **Milestone B — Realtime Wake v1**

Act names frequency \-\> receiver selects \-\> queue \-\> executor \-\> attention/inference dry-run \-\> receipt

Receiver remains selector-only.

## **Milestone C — LLM Inside Lab**

projection context \-\> inference adapter \-\> schema output \-\> LLM receipt \-\> candidate/attention

No direct consequence.

## **Milestone D — Dream Machine Tenant**

corpus \-\> claim map \-\> drift report \-\> candidate Act \-\> evaluator \-\> attention/workbench

No canon mutation.

## **Milestone E — Three-Machine Body**

machines registered  
services allowlisted  
receiver/clock/executor active  
fleet projection visible  
---

# **24\. Implementation deltas from current source**

## **Delta 1 —**

## **`lab_log`**

## **removal**

Current/foundation direction already supports removal.

Action:

fresh ledger never creates lab\_log  
archive old lab\_log exports as corpus/evidence only

## **Delta 2 —**

## **`if_ok`**

## **addressing reconciliation**

Action:

rewrite v3 implementation docs from data.if\_ok to canonical if\_ok slot

## **Delta 3 — receiver purification**

Action:

remove deterministic execFileSync from receiver  
receiver writes queued/selection record  
deterministic wake becomes executor adapter

## **Delta 4 — executor dispatcher**

Action:

replace Devin-specific executor core with generic dispatch  
route\_to\_devin adapter handles Devin

## **Delta 5 — process contradiction**

Action:

devin\_session \-\> deprecated everywhere  
route\_to\_devin \-\> current  
regenerate runnable processes

## **Delta 6 — projection dynamic metadata**

Action:

add class stable/dynamic  
add pin model/prompt/params/seed  
add parent\_projection\_hashes  
add projection\_spec\_hash  
add descent primitive

## **Delta 7 — dangerous adapters closed**

Action:

worker\_run and workflow\_run remain disabled until grant/budget/sandbox/evidence enforcement passes  
---

# **25\. Final implementation doctrine**

The fresh Lab implementation is accepted only if the following are true:

1\. public.logline\_acts is the sole canonical ledger.  
2\. logline.receipt.v0 receipts pass Foundation conformance.  
3\. Generated columns are projections of act jsonb.  
4\. Transport/envelope is not receipt content.  
5\. Everything may register.  
6\. Only complete process-contract-matching records activate.  
7\. lab evaluate implements activation rules.  
8\. Clock selects but does not execute.  
9\. Receiver selects but does not execute.  
10\. Queue is rebuildable projection.  
11\. Executor is generic dispatcher.  
12\. Adapters are dumb leaves.  
13\. Mongo projections are non-authoritative and rebuildable.  
14\. Dynamic projections are pinned ladders, not blobs.  
15\. LLMs produce receipts/candidates/attention/projections only.  
16\. Dream Machine proposes, never creates durable consequence directly.  
17\. Three machines are registered as situated body.  
18\. Dangerous capabilities require grants, budget, sandbox, and evidence.  
19\. Every transition is recorded as a new receipt.  
20\. No hidden runtime, daemon, projection, or model becomes authority.  
---

# **26\. Build mantra**

Register.  
Evaluate.  
Select.  
Queue.  
Dispatch.  
Adapt.  
Close.  
Project.  
Dream.  
Propose.

Never skip the ledger.  
Never let projections rule.  
Never let selectors execute.  
Never let adapters self-authorize.  
Never let LLMs create consequence.  
