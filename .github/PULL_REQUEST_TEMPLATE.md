<!-- Thanks for contributing. Keep changes test-first and the canon intact. -->

## What & why

<!-- What does this change and why? Link any issue. -->

## Checklist

- [ ] Tests added/updated and `pytest -q` passes
- [ ] Audits pass (`lab foundation suite`, `dream verify`, `harness`, `fleet audit`)
- [ ] `python -m build` succeeds (if packaging touched)
- [ ] Canon respected: RFC 8785 conformance still green; no silent drops / fake closure /
      self-asserted authority; selectors don't execute; vendored code untouched
- [ ] `CHANGELOG.md` updated under `[Unreleased]` (for user-visible changes)
