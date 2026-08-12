# Dream Machine — Fine-Grained Implementation Specification

**Status:** implementation spec / material source.  
**Authority:** none by itself. Register by pointer if needed. Do not treat this file as canon or admitted law.  
**Scope:** Santo André Laboratory, ActGraph, LogLine, minilab.work, Devin, local LAB fleet, and project corpus.  
**Date:** 2026-06-13.  

## 0. Identity

Dream Machine is a self-auditing imagination engine for living systems.

It has two halves:

```text
Dream
  synthesis, imagination, recombination, simulation, possible futures,
  patch/spec/doc generation, project self-reflection.

Machine
  ingestion, fingerprinting, citations, canonicality maps, contradiction
  detection, reproducibility, audit trails, source custody, evidence links.
```

Operational definition:

```text
Dream Machine turns scattered work into canonical, executable memory.
```

Killer feature:

```text
It does not merely retrieve. It judges canonicality with evidence.
```

Non-negotiable boundary:

```text
Dream Machine can say:
  "This appears canonical under the available evidence."

Dream Machine cannot say:
  "This is institutional truth."

Only Gate/admitted Acts can do that.
```

## 1. Product Questions

The first surface must answer questions like:

```text
Which version is canonical?
What changed since May?
What is implemented but undocumented?
What doctrine exists only in conversations?
What UI copies are alive?
What should be deleted?
What is the next coherent build?
What are we pretending is solved?
Which docs contradict code?
Which docs are stale?
Which features exist in files but not in admitted Acts?
Which claims need Ghosts?
```

Every answer must include:

```text
evidence
citations / source pointers
timeline
confidence
contradictions
recommended action
candidate patch/spec/doc when appropriate
```

## 2. Design Laws

### DM-L1 — Material is not semantic truth

Source files, chats, reports, screenshots, logs, database schemas, UI artifacts, repos, embeddings, summaries, and Dream Machine answers are material/projection/evidence candidates.

### DM-L2 — Canonicality is a judged projection

A canonical map is a projection over material and admitted Acts. It is useful, rebuildable, and auditable. It is not authority.

### DM-L3 — No claim without evidence

Every extracted claim must carry source pointer, extraction method, time, and confidence. Claims without source are rejected or marked `unsupported`.

### DM-L4 — No fake final answer

A “final answer extraction” must name the source period, source messages/docs, supersession status, and confidence. If multiple final answers exist, report contradiction.

### DM-L5 — Dreaming requires a machine trail

Speculation is allowed only when marked as speculation and linked to evidence inputs. The generated idea must state what would prove or falsify it.

### DM-L6 — Patch proposals are candidates

Generated patches/specs/docs are material proposals. They require review, tests, and, if consequential, Act admission.

### DM-L7 — Private corpus first

Operate locally by default. Do not leak corpus to external model/API unless an explicit run envelope and data policy allow it.

### DM-L8 — Secrets never enter embeddings

Secrets, tokens, private credentials, raw personal data, and forbidden material must be detected and redacted or excluded before indexing.

### DM-L9 — The UI is not the ledger

Dream Machine UI may show statuses, canonical maps, and recommended actions. It cannot create truth by display.

### DM-L10 — Rebuildability

Indexes, embeddings, canonical maps, contradictions, and briefs must be rebuildable from source manifests + extraction configs + timeline/provenance.

## 3. Inputs

Dream Machine ingests:

```text
Chat exports
Markdown docs
PDF/DOCX/HTML where extractable
Git repos
Git history
PRs/issues if available
UI screenshots
Figma exports where available
Deploy artifacts
Database schemas/migrations
Logs
Conformance reports
Generated packs
Email/Drive pointers if explicitly provided
ActGraph timeline/projections
```

Each input becomes a `source_manifest` and one or more `artifact_manifest` records.

## 4. Outputs

### 4.1 Canonical Version Maps

A map for a topic/entity/system:

```text
topic: "ActGraph admission gate"
canonical_material: [source refs]
superseded_material: [source refs]
conflicting_material: [source refs]
unknowns: [ghost candidates]
recommended_source_of_truth: admitted Act | file pointer | code path | unknown
confidence: 0.0-1.0
basis: exact evidence list
```

### 4.2 Contradiction Reports

Examples:

```text
Doc says Postgres CAS is implemented; code shows only FileActCas/InMemoryActCas.
README says migration 0001 creates blob store; migration absent.
UI copy A claims live connection; health endpoint shows placeholder.
```

### 4.3 Final Answer Extraction

For a time period or discussion thread:

```text
period: 2026-06-09..2026-06-13
question: "What is the scientific plan?"
answers_by_time: [...]
latest_stable_answer: ...
contradictions: ...
supersessions: ...
confidence: ...
```

### 4.4 Doctrine vs Implementation Separation

This is the Drift Auditor verdict, recorded as a claim's `verification_status`
(distinct from `modality`, which is the source text's stance — see §C5). Values
are the binding enum from `schemas/claim.schema.json`:

```text
verified            claim matches evidence in code/migration/deploy
partially_verified  some but not all of the claim is evidenced
planned_only        claim is a plan; no implementation expected yet
stale               once true; evidence now contradicts it
false               evidence contradicts the claim
unknown             insufficient evidence (NOT punished as false; may open a Ghost)
```

### 4.5 UI Lineage and Duplicate Detection

Group screenshots/routes/components by visual similarity, file origin, text copy, route, deployment, and commit.

### 4.6 Drift Reports

Types:

```text
docs_vs_code
spec_vs_ui
ui_vs_deploy
schema_vs_migration
act_doctrine_vs_runtime
conversation_vs_repo
```

### 4.7 Ranked Open Problems

Each open problem includes:

```text
severity
impact
blocked capability
evidence
recommended next stone
owner
candidate Act kind if consequential
```

### 4.8 Simulation Findings

Dream Machine may simulate rule changes, migrations, or UI consolidation against a shadow dependency graph. It may produce risk findings, not policy.

## 5. Architecture

```text
                           +--------------------------+
                           |  Ask Dream Machine UI    |
                           +------------+-------------+
                                        |
                                        v
+----------------+       +--------------+--------------+       +----------------+
| Source Corpus  | ----> | Ingestion + Fingerprinting | ----> | Evidence Index |
+----------------+       +--------------+--------------+       +----------------+
                                        |                                |
                                        v                                v
                              +---------+---------+          +-----------+--------+
                              | Claim Extraction  |          | Version Graph      |
                              +---------+---------+          +-----------+--------+
                                        |                                |
                                        v                                v
                              +---------+---------+          +-----------+--------+
                              | Contradiction     | <------> | Canonicality Judge |
                              | Engine            |          +-----------+--------+
                              +---------+---------+                      |
                                        |                                v
                                        |                    +-----------+--------+
                                        +------------------> | Dream Synthesizer  |
                                                             +-----------+--------+
                                                                         |
                                                +------------------------+--------------------+
                                                |                                             |
                                                v                                             v
                                      Evidence-backed Answer                       Patch/Spec Candidate
                                                |                                             |
                                                v                                             v
                                      Human/Director Review                   Codex/Devin / Gate Bridge
```

## 6. Components

### C1 — Source Scanner

Purpose: discover files and source collections.

Required behaviors:

```text
walk local directories
read git metadata
identify file type
compute sha256
detect binary/text
detect likely secrets before extraction
emit source_manifest records
never modify source
```

CLI:

```bash
dream scan --root . --out .dream/manifests/source_manifest.jsonl
```

### C2 — Extractor

Purpose: turn artifacts into normalized text/metadata.

Supported v0:

```text
.md .txt .json .yaml .toml .sql .rs .ts .tsx .py .sh .html .css
```

v1:

```text
pdf, docx, screenshots, git history, PRs/issues
```

Output:

```text
extraction record
plain text
structured metadata
warnings
unsupported reason if any
```

### C3 — Chunker

Purpose: split extracted material into evidence-addressable chunks.

Chunk IDs (sketch; `IDS.md` is authoritative and supersedes this where they differ):

```text
chunk_id = "chunk:" + hash32(extraction_id + "|" + byte_start + "|" + byte_end + "|" + normalized_text_sha256)
```

`extraction_id` transitively encodes `source_sha256` and `extraction_config_hash`.
All material IDs are content-addressed and exclude wall-clock time (see IDS.md).

Chunk metadata:

```text
source_id
artifact_id
byte_start/byte_end or line_start/line_end
section heading
created_at / modified_at if known
entity hints
```

### C4 — Embedding + Reranking Index

Purpose: retrieval for large corpus.

Requirements:

```text
local embeddings by default
index versioning
embedding_model_id recorded
redaction policy recorded
rebuildable from chunks
```

Storage v0:

```text
.dream/index/lancedb or sqlite+vec if available
```

Do not block v0 if vector DB is missing. Use lexical search fallback.

### C5 — Claim Miner

Purpose: extract atomic claims.

Claim shape:

```text
subject
predicate
object
scope
modality: implemented | planned | forbidden | claimed | observed | unknown
verification_status (optional, set by Drift Auditor; see §4.4)
time_scope
author_or_source
confidence
source_chunks
```

`modality` is the stance of the source text. `verification_status` is the verdict
after checking against evidence. They are different fields; do not collapse them.

Example:

```json
{
  "subject": "PostgresActCas",
  "predicate": "implementation_status",
  "object": "not implemented in Rust backend",
  "modality": "observed",
  "source_chunks": ["chunk:..."],
  "confidence": 0.83
}
```

### C6 — Version Graph

Purpose: connect versions of docs, packs, UI copies, repos, specs, and generated answers.

Edges:

```text
supersedes
contradicts
implements
documents
mentions
duplicates
forked_from
registered_by_act
points_to_material
```

### C7 — Canonicality Judge

Purpose: rank likely canonical source(s) for a topic.

Inputs:

```text
admitted Acts if available
repo code
recent docs
formal docs
historical chats
conformance reports
freshness
explicit supersession
source reliability class
```

Scoring:

```text
canonicality_score =
  admitted_act_weight
+ code_verified_weight
+ conformance_weight
+ recency_weight
+ explicit_supersession_weight
+ source_reliability_weight
- contradiction_penalty
- stale_penalty
- unverifiable_claim_penalty
```

Default weights are config, not law.

### C8 — Contradiction Engine

Purpose: find incompatible claims.

Contradiction types:

```text
status_conflict
implementation_conflict
authority_conflict
naming_conflict
version_conflict
semantic_boundary_conflict
freshness_conflict
```

### C9 — Drift Engine

Purpose: compare doctrine/spec/code/UI/deploy.

Core checks:

```text
Doc claim -> evidence in repo?
Spec route -> route file exists?
UI claim -> screenshot/deploy evidence?
Migration claim -> migration present?
Command claim -> package script/Makefile/Cargo exists?
Act claim -> admitted Act pointer exists?
```

### C10 — Dream Synthesizer

Purpose: answer questions and propose next coherent action.

It must output:

```text
answer
confidence
source evidence
contradictions
unknowns
recommended action
candidate artifacts
anti-claims
```

### C11 — Patch/Spec Generator

Purpose: generate candidate patches/specs/docs from evidence.

Rules:

```text
no direct apply unless explicit mode
patch includes rationale and evidence
patch includes tests/checks
patch identifies rollback
patch cannot claim admission
```

### C12 — Gate Bridge

Purpose: convert consequential findings into candidate Acts or Ghost candidates.

Never auto-admit by default.

Outputs:

```text
candidate.declared_drift_finding
candidate.opened_research_ghost
candidate.registered_canonical_map
candidate.proposed_patch
candidate.registered_source_material
```

## 7. Data Model

Use SQLite for v0 local material indexes. This is operational material, not ledger truth.

Tables:

```text
dm_sources
  source_id, kind, uri, root_path, discovered_at, source_sha256,
  custody_status, semantic_status

dm_artifacts
  artifact_id, source_id, rel_path, media_type, sha256, size_bytes,
  mtime, git_commit, extraction_status

dm_extractions
  extraction_id, artifact_id, extractor_id, extraction_config_hash,
  text_sha256, text_path, warnings_json

dm_chunks
  chunk_id, extraction_id, line_start, line_end, byte_start, byte_end,
  heading, text_sha256, text

dm_claims
  claim_id, subject, predicate, object, scope, modality,
  time_scope, confidence, extractor_id, created_at

dm_claim_evidence
  claim_id, chunk_id, evidence_role

dm_version_edges
  edge_id, from_ref, to_ref, edge_type, confidence, evidence_json

dm_canonical_maps
  map_id, topic, generated_at, config_hash, confidence,
  answer_json, evidence_json

dm_contradictions
  contradiction_id, kind, claim_a, claim_b, severity, status, evidence_json

dm_runs
  run_id, kind, started_at, closed_at, config_hash, input_refs_json,
  output_refs_json, status, metrics_json
```

Full draft schema in `db/dream_machine_schema.sql`.

## 8. LLM Roles

Each role is a narrow prompt/skill. Role outputs must match schemas.

```text
Corpus Ingestor
  classifies artifacts and extraction risk.

Claim Miner
  extracts atomic claims from chunks.

Canonical Judge
  ranks source of truth for a topic.

Contradiction Hunter
  finds incompatible claims.

Drift Auditor
  checks docs/spec/code/UI/deploy mismatch.

UI Lineage Historian
  groups screenshots/routes/components and finds duplicates.

Simulation Analyst
  tests hypothetical change against dependency graph.

Patch Writer
  proposes patch/spec/doc with evidence and rollback.

Critic
  attacks the answer for unsupported claims.

Archivist
  prepares candidate Acts, custody manifests, and morning brief.
```

## 9. CLI v0

```bash
# initialize local material store
dream init

# scan a repo/folder
dream scan --root . --kind repo --out .dream/manifests/

# extract text and chunks
dream extract --manifest .dream/manifests/source_manifest.jsonl

# extract claims
dream mine-claims --topic "ActGraph gate" --limit 500

# build canonical map
dream canon-map --topic "Santo André Lab research method"

# find contradictions
dream contradictions --topic "ActGraph CAS"

# docs vs code drift
dream drift docs-code --root .

# ask a question
dream ask "What is the actual truth of this project right now?"

# UI lineage
dream ui-lineage --screenshots ./screenshots --routes ./app

# simulate a change
dream simulate --change ./proposals/change.yaml

# produce morning brief
dream morning --since 24h
```

## 10. API v0

Local-only HTTP server, optional:

```text
GET  /health
POST /scan
POST /ask
POST /canon-map
POST /drift
POST /contradictions
POST /simulate
GET  /runs/:id
GET  /topics/:topic/canonical-map
```

Default bind: `127.0.0.1` only. Public bind requires explicit unsafe flag and token.

## 11. Agent Swarm Plan

Minimum resident motions:

```text
1 Corpus Scout      scans new material
1 Claim Miner       extracts claims
1 Canonical Judge   updates canonical maps
1 Drift Auditor     compares docs/code/UI
1 Contradiction Hunter
1 UI Historian
1 Simulation Analyst
1 Morning Editor
```

No-idle rule:

```text
If no assigned task exists, run one safe approved motion:
  scan recent files
  update stale embeddings
  mine claims from unprocessed chunks
  check contradictions in a high-value topic
  re-run drift for changed files
  prepare morning brief
  open Ghost candidate for blocked ingestion
```

Stop conditions:

```text
no source manifest
secret suspected
budget exceeded
external model needed but not authorized
attempt would write outside .dream/
consequential output would bypass Gate
```

## 12. Scheduling

```text
every 5m    scan watched directories for changes
every 15m   mine claims from new chunks
every 30m   contradiction update on hot topics
every 1h    docs-code drift on changed repos
every 2h    canonical map refresh for active topics
nightly     full corpus audit + embedding rebuild if needed
06:30       Dream Morning Brief
weekly      stale docs + lineage cleanup
monthly     training corpus export + eval run
```

## 13. Training / Private Model Plan

Do not start with LoRA. Start with dataset quality.

Dataset families:

```text
evidence-backed Q/A
canonical map judgments
contradiction pairs
claim extraction examples
docs-vs-code drift examples
UI lineage examples
patch proposal examples
negative examples / hallucinated claims
```

Training threshold:

```text
>= 1,000 high-quality claim extraction examples
>= 500 contradiction labels
>= 200 canonicality judgments
>= 100 patch proposals with review outcome
false_citation_rate == 0 in eval subset
```

Evaluation before training:

```text
can extract claims with source spans
can refuse unsupported canonicality
can identify stale docs
can distinguish material from Act truth
can generate patch with rollback/tests
can report uncertainty as Ghost candidate
```

## 14. GPU Use Plan

A large GPU helps only after corpus hygiene exists.

GPU lanes:

```text
local embeddings at scale
reranking
vision similarity / screenshot lineage
larger local context model for synthesis
fine-tuning / LoRA
batch simulation / patch critique
```

Not useful if:

```text
sources are not fingerprinted
claims lack evidence
secret redaction is absent
canonical map rules are undefined
benchmarks are missing
```

## 15. Implementation Phases

### Phase 0 — Spec and skeleton

Output:

```text
.dream/ ignored material dir
crates or tools/dream-machine skeleton
schemas
SQLite schema
README
acceptance tests as docs
```

No LLM calls. No embeddings.

### Phase 1 — Read-only ingestion

Build:

```text
source scanner
sha256 manifest
text extractor for text-like files
chunker
SQLite store
```

Definition of done:

```text
Can scan repo and produce source/chunk counts.
Can rebuild DB from scratch.
No source files changed.
Secrets excluded or flagged.
```

### Phase 2 — Lexical evidence search

Build:

```text
ripgrep/sqlite FTS search
source citation format
ask command returns only extracted snippets
```

No synthesis yet.

### Phase 3 — Claim mining

Build:

```text
claim schema
claim miner prompt
claim validation
claim evidence links
unsupported claim rejection
```

### Phase 4 — Canonical map v0

Build:

```text
topic grouping
canonicality scoring config
canonical map output
contradiction reporting
```

### Phase 5 — Drift audits

Build:

```text
docs-code drift
command verification
migration/schema drift
README stale detector
```

### Phase 6 — Dream answerer

Build:

```text
ask command with retrieved evidence
answer schema
critic pass
confidence + contradictions + unknowns
```

### Phase 7 — UI lineage

Build:

```text
screenshot ingestion
OCR/text extraction where available
perceptual hash
route/component matching
lineage groups
```

### Phase 8 — Simulation and patch proposals

Build:

```text
change impact graph
simulation reports
patch proposal generator
rollback/test requirements
```

### Phase 9 — Gate bridge

Build:

```text
candidate Act templates for findings/ghosts/source registrations
explicit --propose only
no auto-admission by default
commands: dream declared-drift-finding --propose; dream opened-research-ghost --propose; dream registered-canonical-map --propose; dream proposed-patch --propose; dream registered-source-material --propose
```

### Phase 10 — Private model / fine-tuning

Build only after dataset thresholds.

## 16. First 10 Small Stones

1. `dream init` creates `.dream/` and SQLite DB.
2. `dream scan --root .` writes `dm_sources` and `dm_artifacts`.
3. Text extractor supports `.md`, `.txt`, `.json`, `.yaml`, `.toml`, `.rs`, `.ts`, `.tsx`, `.py`, `.sql`, `.sh`.
4. Chunker records line ranges.
5. `dream search "query"` returns cited chunks.
6. `dream classify-docs` labels docs as guide/manual/rule/spec/plan/runbook/reference/unknown.
7. Claim schema validation and sample manual claim miner.
8. `dream canon-map --topic X --manual` builds map from selected evidence.
9. `dream drift docs-code` checks commands/routes/files mentioned in docs exist.
10. `dream morning --since 24h` summarizes new material and contradictions.

## 17. What Not To Build Yet

```text
no autonomous patch apply
no external corpus upload
no public Dream Machine UI
no automatic admission
no model fine-tune
no full workflow engine
no Scan-as-Gate
no canonicality without citations
no embeddings before redaction policy
no UI simulator before lineage ingestion works
```

## 18. Acceptance Gate

Dream Machine v0 is acceptable when:

```text
It can ingest a repo/folder without modifying it.
It can cite source chunks with stable IDs.
It can answer "which version is canonical?" with evidence and uncertainty.
It can find at least one real docs-code drift.
It can refuse to answer when evidence is insufficient.
It can produce a candidate Ghost for unresolved contradiction.
It can rebuild its material DB from source manifests.
It never claims semantic authority.
```

## 19. Final Maxim

```text
Dream Machine should let the work dream about itself.
The Machine part exists so the dream cannot lie cheaply.
```


Phase 10 commands: dream model-export; dream model-eval; dream model-train.
