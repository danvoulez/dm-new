# Vendored third-party code

Code here is copied verbatim from upstream and kept in-tree on purpose: the Lab
runtime declares **zero runtime dependencies**, and the things vendored here are
load-bearing for determinism, so we want their exact bytes auditable in the repo
rather than resolved at install time.

## `rfc8785/` — JSON Canonicalization Scheme (RFC 8785 / JCS)

- **Upstream:** https://github.com/trailofbits/rfc8785.py — PyPI `rfc8785`
- **Version vendored:** `0.1.4`
- **Author:** Trail of Bits (`opensource@trailofbits.com`)
- **License:** Apache License 2.0 (see `rfc8785/LICENSE`)
- **Upstream dependencies:** none (pure Python, `requires-python >= 3.8`)
- **Provenance:** `_impl.py` sha256 `c25bc3a046528482d53bee3487b837f31dd9c05f33e8f13288c7aab320932cec`
  (matches the `0.1.4` sdist from PyPI; files copied byte-for-byte, unmodified).

### Why this and why vendored

The content hash *is* an Act's identity. If two conformant implementations
canonicalize the same Act to different bytes, every receipt becomes meaningless.
`json.dumps(sort_keys=True)` is **not** RFC 8785: it mis-serializes numbers
(`1.0` → `"1.0"` instead of `"1"`, wrong exponent forms), sorts keys by Unicode
code point instead of UTF-16, and accepts integers outside the IEEE-754 safe
domain (±(2^53−1)) that cannot round-trip across languages. This module is the
reference-grade implementation that the Lab's Rust gate must agree with byte-for-byte.

Correctness is proven, not assumed: `tests/test_jcs_conformance.py` runs the
upstream conformance vectors (`tests/jcs_conformance/`) and asserts byte-equality,
plus the RFC 8785 number edge cases.

### How to update

1. `pip download rfc8785==<new-version> --no-deps --no-binary :all:`
2. Copy `src/rfc8785/{__init__.py,_impl.py,py.typed}` and `LICENSE` here, verbatim.
3. Refresh the version + sha256 above.
4. Re-run `tests/test_jcs_conformance.py` and the full suite. Do not hand-edit the
   vendored sources — patch upstream and re-vendor instead.
