# DREAM MACHINE TENANT

This document belongs to the fresh Lab v0 documentation set. It preserves the root law: everything may register; only complete records matching registered process contracts activate.

See `GENESIS.md`, `processes/PROCESS_CATALOG.md`, and `LAB_TOPOLOGY.md` for the implemented baseline.

Dream Machine is a tenant of the Lab, not the Lab itself. It may ingest, classify, compare, simulate, synthesize, and propose. It may not mutate canon, run code, call external effects, or make projection/canonicality display into authority.

Implemented Lab wrapper:

- `lab dream verify` (corpus defaults to `tests/fixtures/dream-machine`; override with `--source <path>`)
- `lab dream ingest <corpus>`
- `lab dream propose <question>`
- `lab dream register-candidate <json-file> --schema <schema_name>`

`ingest` computes a deterministic material manifest for a file or directory and registers it as candidate memory. It does not mutate the source corpus and it does not create an authority projection.

`propose` registers a candidate proposal shell for attention. The wrapper deliberately records `answer: null` and explicit unknowns; it does not fake a final Dream Machine answer and it does not call an external model.

`register-candidate` validates the payload against the DDMM schema and invariants before writing a LogLine receipt. The resulting Act is candidate memory:

- `did: dream.candidate`
- `status: candidate`
- `if_ok: attention-raise.v1`
- `external_effect: false`
- `activates_process: false`

Invalid Dream payloads are refused at the wrapper boundary and are not written as if they were valid proposals. Valid Dream payloads are still not authority; they are candidate material for attention, review, projection, or later process evaluation.
