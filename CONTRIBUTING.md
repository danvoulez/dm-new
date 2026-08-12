# Contributing

Thanks for helping build the Lab. This project has a strong doctrine; please read it
before changing runtime behavior.

## Development setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[webauthn]" pytest build
```

## Running the checks

```bash
pytest -q                # full suite; test_signing skips without [webauthn]
lab foundation suite     # RFC 8785 receipt conformance (needs Node for the reference verifier)
lab dream verify
lab harness
lab fleet audit --root fleet
python -m build          # the package must build cleanly
```

All of the above run in CI on every push and pull request.

## The canon (do not break these)

1. **Determinism is the product.** Receipt hashing is true RFC 8785 via the vendored
   reference (`lab/_vendor/rfc8785/`). **Never** swap canonicalization to `json.dumps`
   or add a dependency for it. Any change must keep `tests/test_jcs_conformance.py` green.
2. **Don't close over ghosts.** No silent drops (selectors raise durable `doubt`); no fake
   completion (evidence obligations are enforced before `fechado`); no self-asserted
   authority (L4/L5 need a registered grant *and* a verified passkey signoff, fail-closed).
3. **Selectors don't execute.** The clock and receiver only select and queue; the executor
   governs and re-evaluates before dispatch. Adapters are dumb leaves — they return AUX and
   never write the ledger.
4. **Projections / LLMs / Dream Machine are non-authoritative.** They propose; they never
   activate processes or create consequence.
5. **Vendored code is verbatim.** Do not hand-edit `lab/_vendor/**`. To update, re-vendor
   per `lab/_vendor/README.md` and refresh the recorded version + checksum.

## Workflow

- **Test-first.** Add a failing test, then the implementation. Match the surrounding style.
- **Keep the kernel zero-dependency.** New third-party needs (only crypto so far) belong in
  an optional extra behind a lazily-loaded boundary, never imported by the core.
- **Add capability as data, not daemons.** New behavior is usually a new contract
  (`processes/*.v1.yml`), adapter, or schema — not a new resident process.
- Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes.

## Adding things

- **A process:** add `processes/<name>.v1.yml`, then `lab process generate` to refresh the
  catalogs. Runnable status is *derived* — wire the adapter to make it runnable.
- **An adapter:** register it in `lab/adapters.py`; it must return only AUX and produce any
  fields the contract's `evidence_must_include` declares.
- **An evidence requirement:** add `evidence_must_include: [...]` to the contract; the
  executor will refuse to close `fechado` without those fields.

By contributing you agree your contributions are licensed under the project's
[Apache-2.0](LICENSE) license.
