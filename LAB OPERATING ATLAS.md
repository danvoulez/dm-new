Absolutely. Let’s make it an **operating atlas** instead of a one-page map.

Grounded in the conversation excerpt you uploaded and the architecture we have been converging around.  

# **LAB OPERATING ATLAS**

## **A detailed map of the current confusing-but-coherent organism**

## **0\. The main calming truth**

You do **not** have many systems.

You have **one Lab** in the middle of a rename, a consolidation, and a wiring phase.

What currently feels like:

CLI \+ ActGraph \+ new CLI \+ ledger \+ projections \+ Mongo \+ Dream Machine  
\+ receiver \+ goblin \+ Devin \+ 3 Macs \+ Meu-Lab \+ folders \+ process docs

is actually:

One ledger-backed institutional runtime  
with several organs that are finally becoming wired together.

The dizziness comes from the fact that the organs are real now.

Before, they were mostly doctrine, prototypes, experiments, names, sketches, and folders.

Now they are becoming infrastructure:

* machines stay on  
* Supabase emits realtime  
* receiver hears citations  
* CLI writes Acts  
* process folders define activation  
* Mongo has projections  
* Dream Machine has a role  
* executor/clock/queue exist  
* adapters are becoming the right abstraction

That feels like “too much.”

But architecturally, it is one thing:

**The Lab remembers everything, activates only what is complete, dispatches through one governed runtime tree, projects disposable views, and lets Dream Machine think without giving it authority.**

That is the spine.

Everything else is wiring.

---

# **1\. The organism model**

The Lab is best understood as an organism.

Not an app.

Not a daemon pile.

Not “ActGraph plus scripts.”

Not a personal automation folder.

An organism with organs:

| Organ | Concrete thing | Role |
| ----- | ----- | ----- |
| **Memory** | `logline_acts`, with legacy `lab_log` nearby | Remembers every registered record |
| **Hands** | Rust CLI / Lab kernel | Writes, evaluates, schedules, dispatches, closes |
| **Body** | 3 always-on computers | Gives the Lab physical presence |
| **Nervous system** | receiver, clock, queue, executor | Selects, queues, dispatches |
| **Reflex leaves** | adapters | Actually perform bounded effects |
| **Eyes** | Mongo / projections | Show disposable maps of the ledger |
| **Attention** | `doubted`, gaps, ghosts, v5 attention | Shows what needs human/context |
| **Imagination** | Dream Machine / dynamic projections / LLMs | Thinks, compares, synthesizes, proposes |
| **Constitution** | Meu-Lab numbered folders | Defines law, vocabulary, process contracts |
| **Doors** | GitHub, Devin, email, notification, local workers | External surfaces and effect membranes |

The mistake would be to let each organ become a separate authority.

The correct pattern is:

One Lab.  
One ledger.  
One activation model.  
One runtime tree.  
Many adapters.  
Many projections.  
Many tenants.  
---

# **2\. The core doctrine**

## **2.1 Universal registration**

The Lab does not begin with rejection.

It begins with memory.

Everything that arrives may be registered.

A malformed Act is not “bad” in the sense of being deleted or denied.

It is:

registered  
remembered  
frozen  
non-activating

That is a very important inversion.

Old model:

valid \-\> admitted  
invalid \-\> rejected

Current Lab model:

anything arrives \-\> registered as memory

if complete and process-matching \-\> activates  
if incomplete or non-matching \-\> remains inert/frozen

The better phrase is:

**Admission is universal. Activation is earned.**

This removes negative semantics from the runtime.

No error as institution.

No rejected ghost rows.

No hidden loss.

No “bad input disappears.”

The Lab remembers the terrible, the incomplete, the weird, the malformed, the premature.

It simply does not let them wake machinery unless they match a process contract.

---

## **2.2 Activation is not moral approval**

Activation does not mean “this is true.”

Activation does not mean “this is good.”

Activation does not mean “Dan approved this.”

Activation means only:

This registered record has enough canonical structure  
to match a current process contract  
and therefore may move to the appropriate machinery.

This is huge.

It lets the Lab be permissive at the memory boundary and strict at the consequence boundary.

So the ledger can be generous, while the runtime is disciplined.

---

## **2.3 Consequence is gated by structure**

The Lab’s main safety principle is not “trust the sender.”

It is:

Does this record match a registered process contract?  
Does it name real entities/processes/adapters?  
Does it carry required fields?  
Does it fall within authority scope?  
Does the executor have permission and budget?  
Can it produce evidence?

That means trust is not a vibe.

Trust is structural.

A record either has the shape required to activate, or it does not.

---

# **3\. The three-layer world**

The Lab has three worlds that must never be confused.

## **3.1 Memory world**

This is the ledger.

logline\_acts

Everything can enter.

The memory world preserves:

* arrivals  
* attempts  
* incomplete rows  
* full rows  
* process transitions  
* receipts  
* evidence  
* ghosts  
* supersession  
* provenance  
* mistakes  
* experiments

Memory is broad.

Memory is permissive.

Memory is append-only in spirit.

Memory is where the Lab remembers that something happened.

---

## **3.2 Projection world**

This is Mongo and other read models.

PROJECTIONS  
Mongo collections  
views  
indexes  
attention dashboards  
LLM context ladders

Projection world is not authority.

It is how the Lab sees itself.

It can be rebuilt.

It can be wrong.

It can be deleted.

It can be regenerated.

It can be dynamic.

It can be abundant.

Its law is:

If projection disagrees with ledger, projection is wrong.

Projection world exists for:

* Dan’s orientation  
* UI navigation  
* agents’ reduced-context reasoning  
* dynamic LLM maps  
* current state summaries  
* gaps  
* ghosts  
* process indexes  
* runnable process lists  
* dashboards

Projection is cognition, not consequence.

---

## **3.3 Effect world**

This is where irreversible or semi-irreversible things happen.

Examples:

* send notification  
* email a person  
* call Devin  
* run code  
* write external file  
* mutate GitHub  
* deploy  
* schedule external event  
* trigger local worker  
* execute workflow

Effect world is dangerous.

So it must be narrow.

The effect world is entered only through:

executor \-\> adapter

Not through Mongo.

Not through Dream Machine.

Not through inline receiver hacks.

Not through random daemons.

Not through a string that “looks like a path.”

The executor is the airlock.

---

# **4\. The physical body**

The Lab now has a body.

That matters.

It is no longer just a folder.

It is becoming physically situated infrastructure.

## **4.1 The three computers**

The machines should not be treated as interchangeable cloud nodes.

They are lived machines with roles.

| Machine | Lived role | Architectural meaning |
| ----- | ----- | ----- |
| **Primary use/editing machine** | Where Dan actually works | Human workbench / proposal surface |
| **Official/capital machine** | Supposed canonical authority, often forgotten | Capital node / official custody candidate |
| **Inference machine** | Somewhat forgotten, acceptable/healthy | Dedicated inference/worker leaf |

The important correction is:

The architecture must account for the gap between nominal authority and real workflow.

Do not pretend humans will always place things on the “official” machine.

The Lab has to absorb reality:

* Dan edits where he edits.  
* Work starts where it starts.  
* Some machines are forgotten.  
* Some machines are physically connected.  
* Some machines are always on.  
* Authority is not the same thing as convenience.

The system should register these facts instead of pretending them away.

---

## **4.2 Physical dependencies are evidence, not IaC**

The physical ethernet cable between machines is not “a resource.”

It is not Terraform.

It is not reproducible by a manifest.

It is a hand-seated dependency.

So in Lab language:

physical cable \= evidence / situated dependency / non-reprovisionable coordinate

Not:

resource to provision

This matters because the Lab is not pretending to be cloud-native.

It is situated.

The physical world is part of the ledger’s evidence universe.

---

# **5\. The ledger**

## **5.1 Canonical table**

The canonical direction is:

logline\_acts

Legacy nearby:

lab\_log

The dizziness partly comes from the rename:

ActGraph / lab\_log era \-\> Lab / logline\_acts era

That rename is not merely cosmetic.

It marks a doctrine shift:

| Old-feeling language | New Lab language |
| ----- | ----- |
| ActGraph | Lab |
| candidate/admission queue | universal registration \+ activation |
| lab\_log | legacy memory / old capture |
| logline\_acts | canonical ledger table |
| daemon per concern | runtime tree |
| special goblin code | adapter/process contract |
| “invalid” | frozen/incomplete/inert |
| rejection | non-activation |
| authority by process | authority by contract \+ executor |

---

## **5.2 LogLine Act as base memory unit**

The core memory unit is still a LogLine Act.

The precise schema may evolve, but the doctrine remains:

* flat fields  
* content-addressed identity  
* AUX as extensible structured material  
* hashes as references  
* append/supersede rather than mutate  
* receipts/evidence as new Acts  
* no hidden second authority

A LogLine Act can register:

* a person  
* an LLM  
* a piece of code  
* a workflow  
* a machine  
* a process  
* a policy  
* a projection  
* a result  
* a receipt  
* a ghost  
* a doubt  
* a notification  
* a runtime transition  
* an evidence artifact

This is why the model is powerful.

The ledger is not just “task storage.”

It is institutional memory.

---

# **6\. Registration versus activation**

This is the most important part of the current architecture.

## **6.1 Registration**

A row enters memory.

It may be beautiful or terrible.

It may be complete or incomplete.

It may be meaningful or useless.

It may be canonical or messy.

It may cite a real hash or nonsense.

It still gets remembered.

Registration says:

The Lab saw this.

Not:

The Lab trusts this.

Not:

The Lab will act on this.  
---

## **6.2 Evaluation**

After registration, an evaluator can inspect the record.

It asks:

Does this match any current process contract?  
Does it have required fields?  
Are the cited hashes resolvable?  
Is the target process known?  
Is the adapter available?  
Is authority scope satisfied?  
Is the record complete enough to activate?

Evaluation does not reject.

It classifies.

---

## **6.3 Activation states**

A useful lifecycle:

registered  
  \-\> incompleto  
  \-\> completável  
  \-\> ativável  
  \-\> processando  
  \-\> fechado

With side paths:

doubted  
inert/frozen  
ghost  
superseded  
retired

Detailed meanings:

| State/property | Meaning |
| ----- | ----- |
| **registered** | It arrived and was remembered |
| **incompleto** | It lacks fields required by a process contract |
| **completável** | It could become activatable if missing structure is supplied |
| **ativável** | It matches a process contract and infra can run it |
| **queued** | It has been selected for execution projection |
| **processando** | Executor/adaptor is actively processing it |
| **fechado** | It produced closure/evidence/receipt |
| **doubted** | It needs governed human/context attention |
| **inert/frozen** | It is valid memory but activates nothing |
| **ghost** | Something expected did not arrive or could not be closed |
| **superseded** | A newer Act replaces its operational role |
| **retired** | No longer runnable/current but preserved |

Key rule:

**Inert is not failure. Doubted is not failure. Incomplete is not failure.**

They are institutional states.

---

# **7\. Processes**

## **7.1 Process is the operational unit**

The better unit is not “candidate.”

The better unit is:

process

A process is a registered, structured machine-readable contract describing how a class of Acts becomes action.

A process is not a daemon.

A process is not a script.

A process is not an app.

A process is a contract plus ritual.

---

## **7.2 One process \= one contract**

Each process should define:

| Field | Meaning |
| ----- | ----- |
| `process_id` | Stable identifier |
| `process_class` | content, evidence, effect, envelope, projection, notification, worker, etc. |
| `activation_ritual` | What fields must be present to activate |
| `required_aux` | Required AUX keys |
| `authority_scope` | Who/what may activate this |
| `adapter` | Which leaf performs the work |
| `danger_tier` | How risky the adapter/effect is |
| `budget_policy` | ACU/time/rate limits |
| `evidence_obligation` | What must be written back |
| `closure_shape` | What “fechado” means |
| `if_doubt` | What to do when unsure |
| `projection_effects` | Which views may be updated |
| `runtime_readiness` | Is adapter installed and available? |
| `version` | Contract version |
| `supersedes` | Previous process contract hash |
| `examples` | Valid and incomplete examples |

This is the heart of the calm model.

Processes define the ritual.

The runtime interprets rituals.

---

## **7.3 Process contract, not process daemon**

Wrong:

new process \-\> new daemon  
new workflow \-\> new background service  
new capability \-\> new listener

Right:

new process \-\> new contract  
new workflow \-\> new registered workflow entity  
new capability \-\> new adapter or adapter mode

The runtime tree remains shared.

That is what prevents daemon sprawl.

---

# **8\. Runtime tree**

The runtime tree is the Lab’s nervous system.

It should look like this:

logline\_acts  
  |  
  v  
ingress/register  
  |  
  v  
evaluator  
  |  
  \+--\> incompleto / frozen / inert  
  |  
  \+--\> completável  
  |  
  \+--\> ativável  
          |  
          v  
selectors  
  |  
  \+--\> clock selector  
  \+--\> receiver selector  
  \+--\> manual selector  
  \+--\> backfill selector  
          |  
          v  
queue projection  
          |  
          v  
executor / dispatcher  
          |  
          \+--\> memory adapter  
          \+--\> notification adapter  
          \+--\> projection\_build adapter  
          \+--\> inference adapter  
          \+--\> route\_to\_devin adapter  
          \+--\> worker\_run adapter  
          \+--\> github adapter  
          \+--\> evidence adapter  
          |  
          v  
closure Acts / receipts / evidence / ghosts / doubt  
          |  
          v  
projections / attention / UI / Dream Machine inputs

The runtime has four big layers:

1. **Evaluator**  
2. **Selectors**  
3. **Executor**  
4. **Adapters**

Each has a different job.

Confusing them creates danger.

---

# **9\. Evaluator**

The evaluator asks:

What is this record?  
Can it match a process contract?  
What fields are missing?  
Is it complete?  
Can it become activatable?

The evaluator does not execute.

It does not call Devin.

It does not run code.

It does not send email.

It classifies the record against process contracts.

Possible outputs:

incompleto  
completável  
ativável  
inert  
doubted

The evaluator is the “does this have the right ritual shape?” layer.

---

# **10\. Selectors**

Selectors choose things that are ready or relevant.

Selectors do not execute.

There are at least two first-class selectors.

## **10.1 Clock selector**

The clock selects by time.

It asks:

Which Acts are due now?

It should not:

* execute  
* retry  
* wait  
* mutate external systems  
* call models  
* run code

It only selects due work and queues/marks it for executor processing.

## **10.2 Receiver selector**

The receiver selects by realtime citation.

Supabase says:

A new Act was inserted.

The receiver asks:

Does this Act cite a frequency/hash I listen for?  
Does that cited entity have a wake/process spec?  
Should this record become queued/activatable?

The receiver should not:

* run inference inline  
* run code inline  
* execute workflows inline  
* send emails directly  
* call Devin directly

The receiver is a selector.

This is the correction to the goblin-v3 prototype.

The goblin proof showed the inference leaf works.

But inference belongs under:

executor \-\> inference adapter

not inside:

receiver/listen.mjs

So the corrected rule is:

**Clock selects by time. Receiver selects by citation. Executor executes.**

---

# **11\. Queue**

The queue is a local/rebuildable execution projection.

It is not the source of truth.

It is a working surface for the executor.

The ledger should still record robust transition Acts, such as:

queued  
processando  
fechado  
doubted  
ghost

The queue can be:

* local  
* fast  
* disposable  
* rebuilt from ledger  
* optimized for execution

But the durable state belongs in the ledger.

So:

queue \= operational projection  
ledger \= institutional memory  
---

# **12\. Executor**

The executor is the most important runtime chokepoint.

It is where authority lives.

Not in adapters.

Not in receiver.

Not in clock.

Not in Mongo.

Not in Dream Machine.

The executor checks:

| Check | Question |
| ----- | ----- |
| Process contract | Does this process exist and match? |
| Authority scope | Who/what is allowed to activate it? |
| Adapter tier | How dangerous is the target adapter? |
| Budget | Is there ACU/time/rate budget? |
| Grant | Is a grant required and present? |
| Evidence obligation | What must be written back? |
| Idempotency | Has this already been handled? |
| Blast radius | What can this affect? |
| Runtime readiness | Is the adapter installed/available? |
| Doubt rule | What if confidence/authority is insufficient? |

The executor then calls a dumb adapter.

The executor should be boring, strict, and central.

---

# **13\. Adapters**

Adapters are leaves.

They perform one bounded class of effect.

They should not decide whether they are allowed to run.

They should not inspect global authority policy.

They should not escalate.

They should not call other adapters freely.

They receive an approved job from the executor and perform a leaf behavior.

## **13.1 Adapter examples**

| Adapter | Role | Danger |
| ----- | ----- | ----- |
| `memory_register` | Record only, no external effect | Low |
| `projection_build` | Build/update Mongo projections | Low |
| `notification` | Notify Dan/person/entity | Medium |
| `inference` | Call model/membrane and return constrained result | Medium |
| `route_to_devin` | Start/delegate Devin work | High |
| `worker_run` | Run local code | High |
| `github_check` | Query/mutate GitHub depending mode | Medium/High |
| `evidence_closure` | Attach result/evidence | Low/Medium |
| `email` | Send email | Medium/High depending target |
| `workflow_run` | Resolve and execute workflow graph | Very High |

Danger is not about whether something is useful.

Danger is about blast radius.

---

# **14\. Wake-specs**

Wake-specs are where the Lab becomes magical and dangerous.

An entity can register how it wants to be found or woken.

An entity can be:

* a person  
* an LLM  
* a code artifact  
* a workflow  
* a machine  
* a document  
* a policy  
* a process  
* a projection  
* a mailbox  
* an endpoint

A wake-spec might say:

notify this address  
wake this model  
route through this membrane  
resolve this workflow hash  
run this code artifact  
enqueue this process

The beautiful part:

Everything addressable can become wakeable.

The dangerous part:

If badly governed, wake-specs become remote code execution driven by ledger rows.

So the rules matter.

---

## **14.1 Explicit mode, never shape inference**

The receiver/executor must never infer behavior from the string shape.

Bad:

wake\_spec \= "/Users/dan/script.sh" \-\> run path  
wake\_spec \= "email@example.com" \-\> send email  
wake\_spec \= "abc123hash" \-\> execute hash

Good:

{  
  "mode": "notification",  
  "target": "email@example.com"  
}  
{  
  "mode": "worker\_run",  
  "artifact\_hash": "abc123..."  
}  
{  
  "mode": "workflow\_run",  
  "workflow\_hash": "def456..."  
}

A path is data unless an explicit, authorized process contract says it is executable.

No magic by regex.

No “looks like an email.”

No “looks like a path.”

No “looks like a hash.”

Mode first.

Contract first.

Executor approval first.

---

## **14.2 Wake modes by danger tier**

| Tier | Mode | Meaning | Required control |
| ----- | ----- | ----- | ----- |
| L0 | `locate` | Return/record address only | Provenance |
| L1 | `notify` | Send bounded notification | Rate limit |
| L2 | `deterministic` | Run allowlisted harmless verb | Allowlist |
| L3 | `inference` | Model decision inside schema cage | Schema \+ enum guard |
| L4 | `worker_run` | Run registered code artifact | Grant \+ budget \+ sandbox |
| L5 | `workflow_run` | Resolve/run workflow graph | Grant \+ budget \+ depth/fanout limit |

L0-L3 are relatively safe if bounded.

L4-L5 are the serious power.

They are where the Dream Machine becomes operational.

---

# **15\. Dangerous capability containment**

For dangerous adapters, the Lab should require three structural keys.

## **15.1 Registered artifact**

The Lab does not run arbitrary paths.

It wakes registered entities.

For code:

code artifact must be registered  
hash-pinned  
known  
versioned  
reviewable

For workflow:

workflow must be registered  
hash-pinned  
bounded  
inspectable

No anonymous execution.

No bare path execution.

No unregistered code.

---

## **15.2 Bound authority**

The record must be associated with a known authority.

For v1, that may be:

* Dan  
* trusted machine  
* known Lab process  
* known GitHub App  
* known Devin bridge  
* known local operator

Later, this becomes signed authorship/provenance.

For now, it still needs a bound identity model.

Dangerous work should not activate merely because a row arrived.

---

## **15.3 Grant and budget**

Dangerous effects need explicit grants.

A grant should define:

| Limit | Meaning |
| ----- | ----- |
| `adapter` | Which adapter is allowed |
| `process_id` | Which process may use it |
| `authority` | Who granted it |
| `ttl` | Expiration |
| `acu_limit` | Cost/compute budget |
| `timeout` | Max runtime |
| `rate_limit` | Frequency |
| `network` | Network allowed? |
| `fs_scope` | Filesystem scope |
| `fanout_limit` | Max child wakes |
| `depth_limit` | Max workflow recursion |
| `evidence_required` | What receipt/evidence must be produced |
| `blast_radius` | What it may affect |

The grant is not hidden config.

It is itself a registered object.

The executor cites it when dispatching.

Closure cites it when done.

That creates auditability.

---

# **16\. Projection v4**

Projection v4 is the Lab’s eyes.

It is how Dan, UIs, and LLMs can see the ledger without reading raw rows forever.

The key doctrine:

**Mongo is influential to ergonomics, never to institutional truth.**

Mongo can guide.

Mongo can summarize.

Mongo can cluster.

Mongo can help LLMs think.

Mongo cannot activate consequences alone.

Mongo cannot become a gate.

Mongo cannot be secretly patched as authority.

Mongo cannot be the only place something exists.

---

## **16.1 Stable projections**

Stable projections are deterministic, rebuildable maps.

Examples:

lab\_current\_state  
lab\_current\_law  
lab\_process\_index  
lab\_doc\_gaps  
lab\_ghosts\_and\_gaps  
lab\_runtime\_readiness  
lab\_current\_runnable\_processes  
lab\_attention\_index

They should carry:

{  
  "authoritative": false,  
  "rebuildable": true,  
  "computed\_at": "2026-06-22T...",  
  "projection\_version": "v4.x",  
  "sources": \["logline\_acts"\],  
  "input\_hashes": \["..."\]  
}

Stable projections are for:

* navigation  
* dashboards  
* UIs  
* “where am I?”  
* “what is current?”  
* “what is missing?”  
* “what can run?”  
* “what needs attention?”

They are not for making irreversible decisions.

---

## **16.2 Dynamic projections**

Dynamic projections are the crème.

They are not just summaries.

They are LLM-facing reasoning ladders.

They should help a model:

climb from raw ledger rows  
to clusters  
to concepts  
to candidate proposals  
then descend back to exact hashes

A dynamic projection must carry:

{  
  "authoritative": false,  
  "rebuildable": true,  
  "class": "dynamic",  
  "computed\_at": "...",  
  "projection\_version": "...",  
  "sources": \["logline\_acts"\],  
  "input\_hashes": \["..."\],  
  "pin": {  
    "model": "...",  
    "prompt": "...",  
    "params": {},  
    "seed": "..."  
  }  
}

The `pin` matters because dynamic projection involves model inference.

Without the pin, it is just a loose guess.

With the pin, it is still not authority, but it is at least inspectable.

---

## **16.3 Ladders, not blobs**

The bad version of dynamic projection:

Take entire ledger, summarize into one huge blob, give to LLM.

That is just context-stuffing.

The good version:

L0 raw Acts  
  \-\> L1 grouped citations  
  \-\> L2 process clusters  
  \-\> L3 themes/conflicts/gaps  
  \-\> L4 candidate interpretations  
  \-\> L5 candidate Acts/proposals

Each rung cites the rung below.

The LLM can climb to think and descend to verify.

This is the core v4 insight.

---

# **17\. Dream Machine**

Dream Machine is not “another Lab.”

It is not the runtime.

It is not the ledger.

It is not authority.

Dream Machine is a tenant of the Lab.

Specifically:

Dream Machine \= dynamic projection / research synthesis engine

It may:

* ingest corpus  
* mine claims  
* compare documents  
* judge canonical drift  
* synthesize answers  
* produce candidate Acts  
* propose doctrine  
* reveal contradictions

It may not:

* directly activate infrastructure  
* directly mutate truth  
* secretly become semantic authority  
* skip process activation  
* send effects without executor approval

The clean phrase:

**Dream Machine dreams. Lab activates.**

Or:

Dream Machine \= imagination  
Ledger \= memory  
Executor \= hands  
Mongo \= eyes  
Attention \= conscience  
Process contracts \= law

Dream Machine outputs should become:

candidate/proposed Acts

Those can be registered as memory.

They activate only if they match process contracts.

---

# **18\. Attention v5**

Attention is scarce.

Projection is abundant.

Consequence is governed.

That triangle is important:

projection \= cheap and many  
attention \= scarce and curated  
consequence \= admitted/activated through process

`doubted` is not an error state.

It is a governed human handoff.

A process becomes `doubted` when:

* required authority is missing  
* confidence is insufficient  
* budget is exceeded  
* adapter is unavailable  
* input is ambiguous  
* evidence obligation cannot be satisfied  
* safety tier requires human review  
* model output parks instead of routes  
* workflow fanout would exceed limit

Doubt should produce an attention object.

An attention object should say:

{  
  "why": "...",  
  "source\_hash": "...",  
  "process\_id": "...",  
  "missing\_fields": \[\],  
  "needed\_authority": "...",  
  "suggested\_next\_action": "...",  
  "expires\_or\_recheck": "..."  
}

Doubt is not failure.

Doubt is where the Lab asks for a hand.

---

# **19\. Folder reality**

The dizziness is partly because the same organism exists across many folders.

The cure is to mark each folder’s role.

## **19.1 Folder roles**

| Folder/system | Role | Canonical status |
| ----- | ----- | ----- |
| `Meu-Lab/` | Constitution / doctrine / numbered canon | Should become primary conceptual source |
| `cli/` | Rust Lab kernel and commands | Primary operational source |
| `receiver/` | Realtime selector | Should be shrunk to pure selector |
| `PROJECTIONS/` | Mongo projection implementation | Primary v4 implementation |
| `DM/` | Dream Machine working copy | Needs status decision |
| `DDMM/` | Dream Machine Rust implementation | Likely current implementation candidate |
| `ActGraph/` | Older naming/era | Legacy or source archive |
| `lab_log` | Legacy ledger/capture path | Transitional |
| `logline_acts` | Canonical ledger table | Target canonical |
| `commands/` | CLI helper scripts | Should be folded or classified |
| `pack.sh` / packs | Distribution/install packaging | Fleet deployment support |

The next consolidation move is not to delete everything.

It is to assign status:

canonical  
active implementation  
legacy  
archive  
copy  
deployed copy  
generated  
scratch

Every folder should carry one of those labels.

---

## **19.2 The folder-status manifest**

Create a manifest like:

lab\_folders:  
  Meu-Lab:  
    status: canonical\_doctrine  
    authority: high  
    notes: numbered law/process/projection docs

  cli:  
    status: active\_kernel  
    authority: operational  
    notes: Rust commands, ledger writers, executor

  PROJECTIONS:  
    status: active\_projection\_impl  
    authority: non\_authoritative  
    notes: Mongo views, rebuildable maps

  receiver:  
    status: active\_selector  
    authority: runtime\_selector\_only  
    correction\_needed: remove inline execution

  DDMM:  
    status: active\_dream\_machine\_candidate  
    authority: thinking\_tenant  
    notes: dynamic projection/corpus synthesis

  DM:  
    status: previous\_or\_parallel\_copy  
    needs\_review: true

  ActGraph:  
    status: legacy\_name\_archive  
    needs\_review: true

This alone reduces cognitive load.

Your brain stops asking:

Which folder is real?

The manifest answers it.

---

# **20\. Vocabulary freeze**

A lot of dizziness is naming drift.

The system needs a vocabulary freeze.

## **20.1 Preferred names**

| Prefer | Avoid / mark legacy |
| ----- | ----- |
| Lab | ActGraph as top-level brand |
| LogLine Act | generic row/event |
| `logline_acts` | `lab_log`, unless legacy |
| process | candidate, when activation is meant |
| registered | admitted, when just arrival is meant |
| activation | approval/admission |
| frozen/inert | invalid/rejected |
| doubted | error/failure |
| executor | daemon/worker brain |
| adapter | bespoke daemon |
| projection | truth cache |
| Dream Machine | runtime/authority |
| route\_to\_devin | devin\_session |
| receiver selector | websocket executor |
| clock selector | scheduler daemon |

A machine should catch violations.

The conformance tool should flag:

devin\_session  
ActGraph top-level  
lab\_log as canonical  
rejected  
invalid  
error state  
daemon per process  
Mongo authority  
receiver executes

Not necessarily as forbidden words everywhere, but as drift candidates.

---

# **21\. Example flows**

Now the map gets concrete.

## **21.1 Human writes an incomplete process record**

Dan writes something like:

please run X someday maybe

Flow:

arrives  
\-\> registered in logline\_acts  
\-\> evaluator checks process contracts  
\-\> missing required fields  
\-\> state: incompleto / frozen  
\-\> projection updates doc\_gaps / attention maybe  
\-\> no execution

No error.

No rejection.

No hidden loss.

It is remembered.

It may later become completável if another Act supplies missing fields.

---

## **21.2 Human writes a complete scheduled process**

Record includes:

* process id  
* target  
* due time  
* required AUX  
* authority scope  
* evidence obligation

Flow:

registered  
\-\> evaluator matches process contract  
\-\> completável/ativável  
\-\> clock selects when due  
\-\> queue projection receives it  
\-\> executor checks authority/budget/adapter  
\-\> adapter runs  
\-\> closure Act written  
\-\> projections update  
---

## **21.3 Supabase realtime cites a goblin/entity hash**

A new Act enters:

if\_ok includes goblin\_frequency

Flow should be:

Supabase emits INSERT  
\-\> receiver hears  
\-\> receiver resolves cited hash/entity registration  
\-\> receiver sees wake/process spec  
\-\> receiver does NOT run inference  
\-\> receiver queues activatable work  
\-\> executor dispatches inference adapter  
\-\> inference adapter calls membrane/model  
\-\> schema-constrained result returns  
\-\> executor writes awakened/closed/doubted receipt  
\-\> projections update

This preserves the lesson:

record governs  
message triggers  
executor acts  
---

## **21.4 GitHub webhook arrives**

Flow:

GitHub event arrives at membrane  
\-\> raw event registered as LogLine Act  
\-\> if it cites/addresses route process or entity frequency  
\-\> receiver/evaluator marks it activatable  
\-\> executor dispatches github\_check or route\_to\_devin adapter  
\-\> adapter performs bounded action  
\-\> evidence closure written

Important:

The membrane should write canonical Acts, not legacy-only `lab_log`.

The event itself is memory.

The activated process is a separate transition.

---

## **21.5 Dream Machine synthesizes doctrine**

Flow:

Dream Machine ingests corpus  
\-\> builds dynamic projection ladder  
\-\> mines claims  
\-\> detects drift/conflicts  
\-\> synthesizes candidate answer  
\-\> emits candidate/proposed Act  
\-\> candidate is registered  
\-\> evaluator checks whether any process contract activates it

If it is just thought:

registered as proposal  
no consequence

If there is a process like `law_proposal_review`:

registered  
\-\> process contract matched  
\-\> maybe attention object for Dan  
\-\> maybe review workflow

Dream Machine does not directly change canon.

It proposes.

---

## **21.6 Projection build**

Flow:

ledger has new Acts  
\-\> projection\_build process becomes activatable  
\-\> executor dispatches projection adapter  
\-\> adapter rebuilds Mongo collection  
\-\> docs include input\_hashes, rebuildable, authoritative:false  
\-\> closure written

Mongo does not wake infrastructure by itself.

A projection may inform attention.

But activation comes from ledger/process contracts.

---

## **21.7 Dangerous code execution**

A record says:

{  
  "process\_id": "worker\_run",  
  "artifact\_hash": "abc123",  
  "target\_machine": "LAB-512"  
}

Flow:

registered  
\-\> evaluator matches worker\_run contract  
\-\> required fields present  
\-\> executor checks:  
     artifact registered?  
     authority bound?  
     grant present?  
     budget available?  
     target machine allowed?  
     fs/network scope defined?  
     evidence obligation defined?  
\-\> if yes:  
     queue \-\> executor \-\> worker\_run adapter  
\-\> if not:  
     doubted / frozen / incompleto depending missing part

Never:

receiver sees path and runs it

Never:

Mongo view triggers worker

Never:

Dream Machine decides and executes  
---

# **22\. The wiring backlog**

The architecture is mostly settled.

The backlog is wiring and consolidation.

## **22.1 Canonicalization**

Goal:

Stop your brain from diffing every folder.

Tasks:

1. Create folder status manifest.  
2. Mark canonical doctrine folder.  
3. Mark active kernel folder.  
4. Mark active projection implementation.  
5. Mark Dream Machine active copy.  
6. Mark deployed copies versus source copies.  
7. Mark legacy ActGraph/lab\_log material.  
8. Add README status headers to each major folder.

Output:

LAB\_TOPOLOGY.md  
FOLDER\_STATUS.yml  
---

## **22.2 Vocabulary conformance**

Goal:

Prevent drift from re-entering.

Tasks:

1. Add vocabulary map.  
2. Teach conformance script to flag deprecated terms.  
3. Replace `devin_session` with `route_to_devin`.  
4. Replace top-level ActGraph naming with Lab.  
5. Mark `lab_log` as legacy when mentioned.  
6. Replace rejection/error language with frozen/doubted/incompleto where appropriate.

Output:

VOCABULARY.md  
tools/conformance.py  
---

## **22.3 Receiver cleanup**

Goal:

Receiver becomes pure selector.

Tasks:

1. Remove inline inference execution.  
2. Receiver resolves cited hashes/frequencies.  
3. Receiver writes/marks queueable activation records.  
4. Receiver records missed/duplicate taps.  
5. Receiver does idempotency only for selection, not final effect.  
6. Inference logic moves to executor adapter.

Output:

receiver/listen.mjs \= selector only  
executor/adapters/inference.\*  
---

## **22.4 Executor dispatcher**

Goal:

One chokepoint for all action.

Tasks:

1. Add dispatcher table by `process_class` / `adapter`.  
2. Add adapter interface.  
3. Add authority/budget/grant checks.  
4. Add evidence obligation enforcement.  
5. Add doubted output path.  
6. Add idempotency receipt lookup.  
7. Add runtime readiness checks.

Output:

lab executor run  
lab executor daemon  
adapter registry  
---

## **22.5 Process catalog generation**

Goal:

Stop hand-maintaining runnable truth.

Tasks:

1. Read process contracts.  
2. Check required fields.  
3. Check adapter availability.  
4. Check grants/budgets if required.  
5. Generate current runnable process list.  
6. Mark non-runnable reasons.

Output:

CURRENT\_RUNNABLE\_PROCESSES.md generated  
---

## **22.6 Projection v4 class/pin**

Goal:

Prepare for dynamic LLM projections before they multiply.

Tasks:

1. Add `class: stable | dynamic`.  
2. Add `pin` for dynamic.  
3. Add projection-spec hash.  
4. Add rung/parent references.  
5. Add descent primitive: cite input hashes.  
6. Prevent UI from treating dynamic unpinned projection as fact.

Output:

projection schema v4.1  
lab project  
lab cite  
---

## **22.7 Dream Machine integration**

Goal:

Dream Machine becomes a tenant, not a parallel universe.

Tasks:

1. Decide active folder: `DM` or `DDMM`.  
2. Register Dream Machine as Lab entity/process tenant.  
3. Ensure outputs are candidate/proposed Acts.  
4. Ensure dynamic projection metadata is present.  
5. Ensure no direct consequence path.  
6. Add process contract for Dream Machine proposal review.

Output:

dream\_machine process contract  
candidate Act output path  
---

# **23\. What not to build**

This may be the most important section.

Do not build:

one daemon per process

Do not build:

receiver that executes code/workflows

Do not build:

Mongo-triggered effects

Do not build:

Dream Machine as authority

Do not build:

path-shaped wake specs

Do not build:

hidden background residents everywhere

Do not build:

manual CURRENT\_RUNNABLE\_PROCESSES forever

Do not build:

another parallel ledger

Do not build:

LLM summaries with no descent to hashes

Do not build:

approval/rejection semantics where frozen/doubted/incomplete would be more correct  
---

# **24\. The anti-daemon law**

Because you are now on three computers and things are beginning to feel like infra, daemon sprawl becomes tempting.

The Lab should enforce:

No random LaunchAgents.  
No random LaunchDaemons.  
No cron sprawl.  
No brew service sprawl.  
No background residents outside the allowed runtime tree.

Allowed resident classes should be few:

clock  
receiver  
executor  
maybe projection daemon  
maybe sanctioned maintenance  
Apple/system services

Everything else should be:

process contract  
queued job  
executor adapter  
foreground command

The reason:

Background residents are hidden authority.

The Lab wants visible authority.

---

# **25\. The “just wiring” truth**

You are not confused because the architecture is broken.

You are dizzy because these migrations are happening simultaneously:

| Migration | Meaning |
| ----- | ----- |
| ActGraph → Lab | Naming and doctrine consolidation |
| `lab_log` → `logline_acts` | Legacy capture to canonical ledger |
| candidate/admit → register/activate | New root law |
| scripts → process contracts | Rituals become data |
| daemons → runtime tree | Shared nervous system |
| inline execution → executor adapters | Authority centralized |
| static views → projection ladder | v4 cognition layer |
| LLM answers → candidate Acts | Dreaming without consequence |
| machines → infra body | Physical deployment becomes real |
| manual maps → generated projections | Less in Dan’s head |

That is why it feels like wiring.

Because it is.

The doctrine is no longer the hard part.

The hard part now is making every existing piece obey the same spine.

---

# **26\. The spine, in one diagram**

                        ┌────────────────────┐  
                         │      DAN / UI       │  
                         │  workbench surface  │  
                         └─────────┬──────────┘  
                                   │  
                                   v  
┌─────────────────────────────────────────────────────────┐  
│                     LOG-LINE LEDGER                     │  
│                       logline\_acts                      │  
│                                                         │  
│       universal registration: everything remembered     │  
└──────────────────────────┬──────────────────────────────┘  
                           │  
                           v  
┌─────────────────────────────────────────────────────────┐  
│                      EVALUATOR                          │  
│       matches records against process contracts          │  
│                                                         │  
│   incomplete \-\> frozen       complete \-\> activatable     │  
└──────────────────────────┬──────────────────────────────┘  
                           │  
             ┌─────────────┴─────────────┐  
             v                           v  
┌─────────────────────┐       ┌───────────────────────────┐  
│   CLOCK SELECTOR    │       │    RECEIVER SELECTOR       │  
│   selects by time   │       │ selects by realtime cite   │  
└──────────┬──────────┘       └─────────────┬─────────────┘  
           │                                │  
           └──────────────┬─────────────────┘  
                          v  
┌─────────────────────────────────────────────────────────┐  
│                   QUEUE PROJECTION                      │  
│          local/rebuildable execution surface             │  
└──────────────────────────┬──────────────────────────────┘  
                           │  
                           v  
┌─────────────────────────────────────────────────────────┐  
│                 EXECUTOR / DISPATCHER                   │  
│ authority \+ grants \+ budget \+ adapter tier \+ evidence   │  
└───────┬───────────┬───────────┬────────────┬────────────┘  
        │           │           │            │  
        v           v           v            v  
   notification  projection   inference   worker/devin/github  
    adapter       adapter      adapter       adapters  
        │           │           │            │  
        └───────────┴───────────┴────────────┘  
                          │  
                          v  
┌─────────────────────────────────────────────────────────┐  
│              CLOSURE / RECEIPTS / EVIDENCE              │  
│       fechado, doubted, ghost, superseded, retired       │  
└──────────────────────────┬──────────────────────────────┘  
                           │  
                           v  
┌─────────────────────────────────────────────────────────┐  
│                    PROJECTIONS v4                       │  
│       Mongo maps, attention, dynamic LLM ladders         │  
│       authoritative:false, rebuildable:true              │  
└──────────────────────────┬──────────────────────────────┘  
                           │  
                           v  
┌─────────────────────────────────────────────────────────┐  
│                    DREAM MACHINE                        │  
│         thinks, synthesizes, proposes candidate Acts     │  
│               never creates consequence directly         │  
└─────────────────────────────────────────────────────────┘  
---

# **27\. The mental shortcut**

When dizzy, ask only five questions.

## **27.1 Is this memory, projection, or effect?**

memory     \-\> ledger  
projection \-\> Mongo/view/LLM context  
effect     \-\> executor/adapter

## **27.2 Is this a process or a runtime?**

process \= contract/ritual  
runtime \= shared evaluator/selector/executor tree

## **27.3 Is this selecting or executing?**

clock/receiver select  
executor executes

## **27.4 Is this authoritative or a map?**

ledger/process contracts \= authority  
Mongo/Dream summaries \= maps/proposals

## **27.5 Is this complete enough to activate?**

yes \-\> activatable  
no  \-\> frozen/incomplete/attention

Those five questions collapse the complexity.

---

# **28\. The final detailed one-line doctrine**

**The Lab is a situated, ledger-backed organism: every arrival is remembered, only complete records matching registered process contracts activate, selectors merely choose, one executor governs all effects through dumb adapters, Mongo projects disposable maps, Dream Machine builds dynamic thought ladders, attention handles doubt, and the three physical machines give the whole thing a body.**

