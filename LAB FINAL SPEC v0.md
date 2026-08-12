# **LAB FINAL SPEC v0**

## **The Processual, Ledger-Backed Lab**

## **Status**

Canonical human-facing specification.

This document defines the Lab as it is to be rebuilt: fresh ledger, clean machines, processual runtime tree, non-authoritative projections, and LLM/Dream Machine partnership.

The implementation spec is separate.  
 This document says what the Lab is.  
 The implementation spec says how to build it.

---

# **0\. The one-sentence version**

The Lab is a fresh, processual, ledger-backed organism: every arrival is registered into memory, only complete records matching registered process contracts activate, and all consequence flows through a shared runtime tree where selectors choose, the executor governs, adapters act, projections guide, and LLMs/Dream Machine propose without becoming authority.

---

# **1\. What the Lab is**

The Lab is not an app.

The Lab is not a pile of daemons.

The Lab is not an agent platform.

The Lab is not Mongo.

The Lab is not Dream Machine.

The Lab is not the CLI alone.

The Lab is a situated institutional runtime made of:

memory       \-\> ledger  
hands        \-\> CLI/kernel  
law          \-\> process contracts  
nervous tree \-\> evaluator, selectors, queue, executor  
leaves       \-\> adapters  
eyes         \-\> projections  
attention    \-\> doubt, gaps, ghosts, human handoff  
imagination  \-\> LLMs and Dream Machine  
body         \-\> three physical computers

Everything in the Lab must fit into this organism.

If a component cannot say whether it is memory, process, selector, executor, adapter, projection, attention, imagination, or body, it is not yet situated.

---

# **2\. Root law**

The Lab’s root law is:

Everything may register.  
Only complete records matching registered process contracts activate.

This means:

arrival is not activation  
registration is not execution  
memory is not consequence  
projection is not authority  
LLM output is not truth  
Dream Machine output is not consequence

A malformed record is not rejected.

A vague message is not deleted.

A terrible Act is not erased.

It is registered.  
 It is remembered.  
 It may remain incomplete, frozen, inert, or doubted.  
 It simply does not move.

Correctness earns movement.

Not approval.  
 Not truth.  
 Not moral validity.  
 Movement.

The reward for registering at all is memory.  
 The reward for writing correctly is activation.

---

# **3\. Processual mindset**

The Lab is processual.

It is not primarily made of objects, services, apps, files, or daemons.

It is made of processes and process participants.

A person is not merely a user.  
 A person is a registered participant in processes of attention, authority, notification, review, and receipt.

An LLM is not merely a model.  
 An LLM is a registered thinking participant with prompts, schemas, pins, receipts, candidate outputs, and doubt behavior.

A piece of code is not merely a file.  
 A piece of code is a registered artifact that may become activatable only under a process contract, authority scope, grant, budget, sandbox, and evidence obligation.

A workflow is not a free-running script.  
 A workflow is a registered process graph that can only run through bounded runtime rules.

A machine is not generic infrastructure.  
 A machine is a registered physical participant with role, services, adapters, deployed paths, and evidence.

A message is not just content.  
 A message is an arrival that may be registered, evaluated, addressed, woken, frozen, routed, doubted, closed, or projected.

The core question is never only:

What is this thing?

The better question is:

What process does this participate in, and what allows it to move?  
---

# **4\. The three worlds**

Every Lab component belongs to one of three worlds.

## **4.1 Memory world**

Memory world is the ledger.

The canonical custody surface is:

public.logline\_acts

Memory records what happened.

It accepts:

arrivals  
attempts  
incomplete records  
complete records  
transitions  
receipts  
evidence  
doubts  
ghosts  
closures  
supersessions  
retirements

Memory says:

The Lab saw this.

Memory does not automatically say:

The Lab should act on this.

## **4.2 Projection world**

Projection world is Mongo, indexes, dashboards, summaries, attention maps, UI views, and LLM context ladders.

Projection world is non-authoritative.

Projection may guide Dan.  
 Projection may guide an LLM.  
 Projection may power a UI.  
 Projection may compress the ledger.  
 Projection may reveal gaps.

Projection must not become truth.

Every projection must be:

authoritative: false  
rebuildable: true  
derived from ledger sources  
traceable through input hashes

If a projection disagrees with the ledger, the projection is wrong.

## **4.3 Effect world**

Effect world is where consequence happens.

Examples:

send notification  
call Devin  
mutate GitHub  
run code  
execute workflow  
send email  
deploy  
write external evidence

Effect world is narrow.

All effects must pass through:

queue \-\> executor \-\> adapter

Never through Mongo alone.  
 Never through Dream Machine alone.  
 Never through receiver alone.  
 Never through an LLM alone.  
 Never through a path-shaped wake-spec alone.

---

# **5\. The ledger**

The fresh Lab has one canonical ledger:

public.logline\_acts

The receipt is the truth.

Generated columns, views, indexes, and projections are maps.

The ledger stores canonical LogLine receipts using the Foundation receipt discipline:

nine stable slots  
AUX  
tuple hash  
content hash  
JCS/RFC8785 canonicalization  
append-only custody

The stable slots are:

who  
did  
this  
when  
confirmed\_by  
if\_ok  
if\_doubt  
if\_not  
status

AUX carries structured additional material.

The receipt must not smuggle consequence into forbidden top-level fields.

Results are records.  
 Evidence is records or evidence objects cited by records.  
 Transport belongs to the envelope boundary, not inside the receipt.

The old `lab_log` surface is legacy/archive only.

The fresh Lab does not build new authority on `lab_log`.

---

# **6\. Registration and activation**

Registration and activation are separate.

## **6.1 Registration**

Registration means:

The Lab remembers this.

It does not mean:

The Lab trusts this.  
The Lab approves this.  
The Lab executes this.  
The Lab treats this as truth.

Everything may register.

## **6.2 Evaluation**

Evaluation asks whether a registered record can move.

It checks:

Does it match a current process contract?  
Are required slots complete?  
Are required AUX fields present?  
Are cited hashes resolvable?  
Is the target process active?  
Is infrastructure available?  
Is idempotency satisfied?  
Is authority sufficient?  
Is a grant required?  
Is budget available?

Evaluation does not reject.

It classifies.

## **6.3 Activation**

Activation means:

This record is complete enough, under a registered process contract, to enter the runtime path.

Activation is not moral approval.

Activation is not final truth.

Activation is eligibility to move.

---

# **7\. Activation states**

The canonical process lifecycle is:

registered  
incompleto  
completável  
ativável  
processando  
fechado

## **7.1**

## **`registered`**

The record exists in Lab memory.

It may not yet have been evaluated.

## **7.2**

## **`incompleto`**

The record was evaluated against a process contract and is missing required structure.

It remains remembered.

It does not move.

## **7.3**

## **`completável`**

The record has enough required fields for at least one process contract, but runtime availability, authority, grants, or infrastructure may still need checking.

## **7.4**

## **`ativável`**

The record is complete, matches an active process contract, and can be queued for runtime movement.

## **7.5**

## **`processando`**

The executor has accepted the queued process and an adapter is in flight or performing the leaf behavior.

## **7.6**

## **`fechado`**

The process has closed with evidence, receipt, or explicit closure.

## **7.7**

## **`doubted`**

`doubted` is a governed uncertainty path.

It is not an error.

It is not rejection.

It means the Lab needs more information, authority, confirmation, budget, evidence, or human judgment.

## **7.8**

## **`inert`**

## **/**

## **`frozen`**

`inert` or `frozen` is a property, not the main lifecycle.

A record may be remembered but non-moving.

That is healthy.

---

# **8\. Process contracts**

A process is not a daemon.

A process is a contract.

Each process defines:

process id  
process class  
activation ritual  
required slots  
required AUX  
authority scope  
adapter target  
danger tier  
budget policy  
grant requirements  
evidence obligation  
idempotency rule  
doubt behavior  
closure shape  
runtime readiness  
examples  
version  
supersession

The unit of definition is:

one process \= one contract

The unit of execution is:

one runtime tree \= many adapters

The Lab should add new capability by adding or updating contracts, schemas, adapters, and projections — not by creating a new daemon for every process.

---

# **9\. Runtime tree**

The Lab runtime is a tree.

L0 ledger: logline\_acts  
  \-\> ingress: register everything  
  \-\> evaluator: match records against process contracts  
  \-\> selectors:  
       clock    \= selects by time  
       receiver \= selects by realtime citation, frequency, or hash  
       manual   \= selects by operator action  
       backfill \= selects missed or stale work  
  \-\> queue: local rebuildable execution projection  
  \-\> executor: generic governed dispatcher  
      \-\> adapter: none / memory  
      \-\> adapter: projection\_build  
      \-\> adapter: attention\_raise  
      \-\> adapter: inference  
      \-\> adapter: notification  
      \-\> adapter: route\_to\_devin  
      \-\> adapter: github\_check  
      \-\> adapter: local worker  
      \-\> adapter: evidence store  
  \-\> closure:  
       evidence  
       receipt  
       fechado  
       doubted  
       ghost  
       retired  
       superseded  
  \-\> projections:  
       Mongo  
       navigation  
       attention  
       runtime readiness  
       Dream Machine context  
       LLM ladders

This is the core engineering shape.

Processes do not own private runtimes.

The shared runtime tree interprets process contracts.

---

# **10\. Engine roles**

## **10.1 Ingress**

Ingress registers arrivals.

It does not decide consequence.

## **10.2 Evaluator**

Evaluator matches records against process contracts.

It does not execute.

## **10.3 Clock**

Clock selects records by time.

Clock is the UTC ruler.

It does not execute.  
 It does not mutate external systems.  
 It does not wait for work to finish.  
 It does not decide retry policy.  
 It does not call adapters.

It selects and queues.

## **10.4 Receiver**

Receiver selects records by realtime citation, frequency, or hash.

It listens for ledger inserts.

It resolves what was named.

It queues activatable work.

It does not run inference.  
 It does not run code.  
 It does not execute workflows.  
 It does not call Devin.  
 It does not send final notifications.

The receiver reads the ledger, not the message.

The message triggers.  
 The registration governs.

## **10.5 Queue**

Queue is a local, rebuildable execution projection.

Queue is not truth.

If the queue is deleted, it should be recoverable from the ledger.

## **10.6 Executor**

Executor is the sole governed dispatcher.

It checks:

process contract  
activation state  
authority scope  
adapter danger tier  
grant  
budget  
idempotency  
runtime readiness  
evidence obligation  
doubt rule

Only then does it dispatch an adapter.

## **10.7 Adapters**

Adapters are dumb leaves.

They perform bounded behavior after executor approval.

They do not self-authorize.

They do not decide whether they are allowed to run.

They do not silently escalate.

They do not secretly become policy.

## **10.8 Closure**

Closure writes the next durable record:

evidence  
receipt  
fechado  
doubted  
ghost  
retired  
superseded

Closure must not hide uncertainty.

## **10.9 Projections**

Projections show maps.

They do not govern.

## **10.10 Dream Machine**

Dream Machine thinks, compares, synthesizes, and proposes.

It does not create consequence directly.

---

# **11\. Wake and addressability**

The v3 Awakening law remains canonical:

Register yourself fully if you want to be woken.  
Address canonically if you want to be heard.

A registered entity may have a frequency.

A sender may name that frequency.

The row naming the frequency triggers attention.

The entity’s own registration defines how it may wake.

A sender can trigger but never define the receiver’s behavior.

A malicious or malformed message may ring only a bell that is already wired.

A message must never smuggle in execution behavior.

Never infer effect from string shape.

Bad:

"/Users/dan/script.sh" means run code  
"person@example.com" means send email  
"abc123hash" means run workflow

Good:

mode \= notification  
target \= person@example.com  
mode \= worker\_run  
artifact\_hash \= abc123...  
mode \= workflow\_run  
workflow\_hash \= def456...

Explicit mode first.  
 Process contract second.  
 Executor approval third.  
 Adapter action last.

---

# **12\. Adapters and danger tiers**

The Lab opens capability by danger tier.

## **L0 — Memory / locate**

No external effect.

Examples:

register  
read  
locate  
index  
inspect

## **L1 — Projection / attention**

Low danger.

Examples:

projection\_build  
attention\_raise  
doc\_gap\_report  
runtime\_readiness\_report

## **L2 — Deterministic bounded action**

Allowlisted deterministic behavior.

No arbitrary shell.

No `bash -c` from ledger text.

## **L3 — Inference**

Model call under schema cage.

The model may classify, summarize, propose, or route.

The model may not execute.

## **L4 — Worker run**

Run a registered code artifact.

Requires:

registered artifact  
authority scope  
grant  
budget  
timeout  
sandbox  
filesystem scope  
network policy  
evidence obligation

## **L5 — Workflow run**

Run a registered workflow graph.

Requires:

registered workflow  
grant  
shared budget  
depth limit  
fanout limit  
cycle detection  
child wake propagation rule  
evidence obligations

L4 and L5 remain closed until the executor can enforce containment.

---

# **13\. Authority, grants, and budget**

Dangerous movement requires authority.

Authority is not vibe.

Authority is registered structure.

A process may require:

authorized who  
confirmed\_by evidence  
specific grant  
machine role  
adapter allowance  
budget  
time window  
human review

A grant is itself a registered object.

A grant declares:

adapter  
process  
granted\_by  
granted\_to  
validity window  
ACU limit  
timeout  
filesystem scope  
network policy  
fanout limit  
depth limit  
evidence obligation  
blast radius

Budget exhaustion is not silent failure.

It becomes `doubted`, `ghost`, or attention.

The Lab never silently drops, silently escalates, or silently retries dangerous work.

---

# **14\. Projections v4**

Projection is the Lab’s eyes.

Mongo is a projection store.

Mongo is not the Lab.

Mongo is not authority.

Mongo is not a gate.

Mongo is not truth.

Projection documents must declare:

authoritative: false  
rebuildable: true  
computed\_at  
projection\_version  
sources  
input\_hashes  
class: stable or dynamic

Stable projections serve:

UIs  
navigation  
current state  
current law  
process index  
runtime readiness  
attention index  
agent index  
machine index  
doc gaps  
ghosts and gaps

Dynamic projections serve LLM reasoning.

Dynamic projections must add:

model  
prompt  
params  
seed  
projection\_spec\_hash  
parent\_projection\_hashes  
ladder\_level

Dynamic projections are ladders, not blobs.

Bad:

summarize everything into one giant context

Good:

L0 raw Acts  
  \-\> L1 grouped citations  
  \-\> L2 process clusters  
  \-\> L3 gaps and conflicts  
  \-\> L4 candidate interpretations  
  \-\> L5 candidate Acts

An LLM climbs to think and descends to verify.

Every abstraction must be traceable back to lower-level hashes.

---

# **15\. Attention v5**

Attention is scarce.

Projection is abundant.

Consequence is governed.

Attention is the field where the Lab surfaces what needs human, model, process, budget, or authority resolution.

`doubted` feeds attention.

Attention objects may represent:

missing fields  
ambiguous authority  
stale docs  
contradiction  
projection leak  
runtime gap  
budget exhaustion  
dangerous request  
needed human judgment

Attention is not an error queue.

Attention is governed presence.

It prevents the system from pretending uncertainty is failure or silently escalating it into action.

---

# **16\. LLMs**

LLMs have two roles.

## **16.1 LLMs as builders**

LLMs helping Dan build the Lab may:

read files  
summarize code  
draft specs  
propose Stage Cards  
write tests  
patch code  
detect drift  
review architecture  
prepare migrations

They must not invent a parallel system.

They must preserve canon.

They must identify which organ they are touching before changing anything.

## **16.2 LLMs inside the Lab**

LLMs inside the Lab are registered participants.

They may:

classify  
summarize  
route  
mine claims  
detect drift  
build dynamic projections  
raise attention  
emit candidate Acts

They may not:

execute code  
send email  
call Devin directly  
mutate canon  
mutate Mongo as authority  
trigger external effects  
bypass process contracts

LLM calls must be:

model-pinned  
prompt-pinned  
schema-caged  
input-hash cited  
projection-hash cited  
receipted

The rule is:

LLMs think.  
Processes activate.  
Executor acts.  
Ledger remembers.  
---

# **17\. Dream Machine**

Dream Machine is a tenant of the Lab.

It is not the Lab.

It is not authority.

It is imagination.

Dream Machine may:

ingest corpus  
mine claims  
compare canon  
detect drift  
synthesize answers  
produce candidate Acts  
raise attention  
create dynamic projection ladders

Dream Machine may not:

mutate canon directly  
execute code  
call external effects  
bypass activation  
become the source of truth

Dream Machine outputs become:

candidate Acts  
proposal Acts  
attention objects  
dynamic projection rungs  
drift reports

Dream Machine dreams.

The Lab activates.

---

# **18\. Workbench**

The workbench is Dan’s surface.

It guides.

It does not rule.

It should show:

topology  
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

The workbench may write proposals, review records, candidate Acts, and operator notes.

It must not bypass the ledger.

It must not write Mongo as authority.

It must not execute effects directly.

---

# **19\. The three machines**

The three computers are the Lab’s body.

They are not generic cloud nodes.

They must be registered as situated machines with:

machine identity  
hostname  
role  
operator account  
Lab root  
deployed paths  
allowed services  
allowed adapters  
forbidden adapters  
physical dependencies  
last seen  
evidence hashes

The lived roles are:

workbench machine  
capital/custody machine  
inference/worker machine

The architecture must respect reality.

Dan may work where he works.

The official machine may not always be where work begins.

The inference machine may be somewhat forgotten and still healthy.

Physical dependencies, including cables, are evidence and situated facts, not abstract reproducible infrastructure.

---

# **20\. Resident services**

Resident services must remain few.

Allowed service classes:

receiver  
clock  
executor  
optional projection daemon  
approved maintenance  
system services

Forbidden drift:

one daemon per process  
one LaunchAgent per idea  
cron sprawl  
brew service sprawl  
hidden always-on scripts  
background residents outside the runtime tree

Hidden residents become hidden authority.

The Lab wants visible authority.

---

# **21\. Legacy boundary**

The following are legacy unless explicitly re-registered into the fresh Lab:

ActGraph as top-level name  
lab\_log as canonical ledger  
old receiver execution behavior  
old goblin inline execution  
devin\_session as current process  
old Dream Machine copies not selected as tenant  
old deployed CLI copies  
old process docs with contradicted status  
old projection outputs without required provenance

Legacy does not mean worthless.

Legacy may be archived, mined, compared, cited, migrated, or used as evidence.

But legacy does not rule the fresh Lab by default.

The current root name is:

Lab

ActGraph is historical lineage.

---

# **22\. Naming canon**

Prefer:

Lab  
logline\_acts  
registered record  
activation  
process contract  
route\_to\_devin  
receiver selector  
clock selector  
queue projection  
executor dispatcher  
adapter  
projection  
Dream Machine tenant  
doubted  
fechado

Avoid or mark legacy:

ActGraph as current root  
lab\_log as current custody  
candidate as primary runtime term  
admission gate as primary model  
devin\_session  
receiver executor  
Mongo truth  
LLM authority  
Dream Machine authority  
rejected  
invalid  
error as final institutional state  
---

# **23\. Final acceptance canon**

The Lab is accepted when:

1\. public.logline\_acts is the sole canonical ledger.  
2\. LogLine receipts pass Foundation conformance.  
3\. Generated columns are projections of receipt JSON.  
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
15\. LLMs produce receipts, candidates, attention, or projections only.  
16\. Dream Machine proposes, never creates durable consequence directly.  
17\. Three machines are registered as situated body.  
18\. Dangerous capabilities require grants, budgets, sandbox, and evidence.  
19\. Every transition is recorded as a new receipt.  
20\. No hidden runtime, daemon, projection, or model becomes authority.  
---

# **24\. The first alive loop**

The first alive loop is:

register  
  \-\> evaluate  
  \-\> queue  
  \-\> executor  
  \-\> safe adapter  
  \-\> fechado  
  \-\> projection visible

The first safe adapter should be:

projection\_build

Not Devin.

Not worker-run.

Not workflow-run.

This proves the spine without opening dangerous capability.

---

# **25\. The second alive loop**

The second alive loop is realtime wake:

Act names frequency  
  \-\> receiver hears insert  
  \-\> receiver resolves registration  
  \-\> receiver queues work  
  \-\> executor dispatches safe adapter  
  \-\> receipt written  
  \-\> projection updates

This proves the v3 awakening law in the fresh Lab.

---

# **26\. The third alive loop**

The third alive loop is LLM participation:

projection context  
  \-\> inference adapter  
  \-\> schema-caged output  
  \-\> LLM receipt  
  \-\> candidate Act or attention object

No direct consequence.

---

# **27\. The fourth alive loop**

The fourth alive loop is Dream Machine as tenant:

corpus  
  \-\> claim map  
  \-\> drift report  
  \-\> candidate Act  
  \-\> evaluator  
  \-\> attention/workbench

Dream Machine does not mutate canon directly.

---

# **28\. The fifth alive loop**

The fifth alive loop is the three-machine body:

machines registered  
services allowlisted  
receiver/clock/executor active  
fleet projection visible  
physical evidence registered

The Lab is no longer just a folder.

It has a body.

---

# **29\. Build partnership**

The Lab will be built by Dan and LLMs together.

Dan provides:

authority  
taste  
judgment  
physical access  
lived context  
final decisions

LLMs provide:

memory support  
source reading  
planning  
drafting  
code assistance  
test generation  
conformance checks  
drift detection  
implementation help

Partnership does not mean LLM autonomy.

LLMs are collaborators, not sovereign actors.

The canon remains the anchor.

---

# **30\. Final doctrine**

The Lab is a processual, ledger-backed organism.

It admits every arrival into memory.

It activates only records completed according to registered process contracts.

Its engines form an optimized runtime tree.

Processes do not get private runtimes.

Clock and receiver select.

Queue stages.

Executor governs.

Adapters act.

Ledger records.

Projections guide.

Attention catches doubt.

LLMs think.

Dream Machine dreams.

Dan decides.

The three computers give the Lab a body.

Every transition leaves evidence.

Nothing hidden becomes authority.

---

# **31\. Build mantra**

Register.  
Evaluate.  
Select.  
Queue.  
Dispatch.  
Adapt.  
Close.  
Project.  
Attend.  
Dream.  
Propose.

Never skip the ledger.  
Never let projections rule.  
Never let selectors execute.  
Never let adapters self-authorize.  
Never let LLMs create consequence.  
Never let Dream Machine become authority.  
