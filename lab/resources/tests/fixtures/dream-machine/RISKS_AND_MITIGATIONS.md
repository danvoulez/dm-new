# Dream Machine Risks and Mitigations

| Risk | Failure mode | Mitigation |
|---|---|---|
| Hallucinated canonicality | System declares truth without evidence | require source refs, confidence, unknowns |
| Doc authority drift | Spec file becomes de facto law | status header; Gate/Act boundary; candidate-only labels |
| Secret leakage | Embeddings include keys/tokens | secret scanner before extraction/embedding |
| Corpus poisoning | Bad file biases canonical map | source reliability, contradiction engine, admitted Act preference |
| Stale embeddings | Retrieval returns obsolete chunks | index versioning, mtime/commit tracking, rebuild schedule |
| Summarization loss | Important caveat disappears | keep chunks and evidence, not only summaries |
| Overfitting private model | LoRA repeats house language but fails evidence | eval on citations/refusals before training |
| UI false positives | screenshot similarity merges wrong copies | combine visual, route, text, commit, human review |
| Auto-patch damage | generated patch applied blindly | no auto-apply, tests+rollback required |
| Simulation becoming law | risk finding becomes blacklist | Gate bridge only, no enforcement without Act |
| Public exposure | corpus UI exposed | localhost default, token for non-loopback |
| Too many agents | noise exceeds signal | no-idle law with scorecard and kill/noise policy |
| Cost creep | cloud models used casually | local-first; budgets per run |
| Source ambiguity | same doc in many places | custody manifest + version graph |
| False negative contradiction | conflict missed due phrasing | periodic topic review + critic role |
