"""RFC 8785 (JCS) conformance proof for the vendored canonicalizer.

Determinism is load-bearing: the content hash IS an Act's identity, and the Python
side must agree byte-for-byte with the Rust gate and any other RFC 8785 implementer.
These tests assert byte-equality against the upstream Trail of Bits conformance
vectors (vendored under ``tests/jcs_conformance/``) plus the RFC 8785 number and
integer-domain edge cases that ``json.dumps`` gets wrong.
"""
import json
from pathlib import Path

import pytest

from lab._vendor import rfc8785
from lab.errors import ReceiptError
from lab.receipt import canonical_json

ASSETS = Path(__file__).parent / "jcs_conformance"
CASES = sorted(p.stem for p in (ASSETS / "input").glob("*.json"))


def _expected_bytes(name: str) -> bytes:
    raw = (ASSETS / "outhex" / f"{name}.txt").read_text()
    return bytes.fromhex("".join(raw.split()))


def test_conformance_corpus_present():
    # Guard against a silently empty corpus making the parametrized tests vacuous.
    assert CASES, "no RFC 8785 conformance inputs found"


@pytest.mark.parametrize("name", CASES)
def test_rfc8785_conformance_byte_equality(name):
    obj = json.loads((ASSETS / "input" / f"{name}.json").read_text())
    expected = _expected_bytes(name)
    assert rfc8785.dumps(obj) == expected
    # The receipt-facing wrapper must produce the identical bytes after utf-8 encode.
    assert canonical_json(obj).encode("utf-8") == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        (1.0, b"1"),               # trailing .0 removed
        (100.0, b"100"),
        (0.0, b"0"),
        (-0.0, b"0"),              # +0 / -0 collapse
        (4.50, b"4.5"),
        (2e-3, b"0.002"),
        (1e21, b"1e+21"),          # exponent threshold (>= 1e21)
        (1e-7, b"1e-7"),           # exponent threshold (< 1e-6), no leading exp zero
        (1e30, b"1e+30"),
        (333333333.33333329, b"333333333.3333333"),  # shortest round-trip
    ],
)
def test_rfc8785_number_edge_cases(value, expected):
    assert rfc8785.dumps(value) == expected


def test_rfc8785_rejects_unsafe_integer_domain():
    # JSON numbers are IEEE-754 doubles; integers beyond 2**53-1 cannot round-trip,
    # so RFC 8785 / I-JSON forbids them rather than silently producing drift.
    assert rfc8785.dumps(2**53 - 1) == b"9007199254740991"
    with pytest.raises(rfc8785.CanonicalizationError):
        rfc8785.dumps(2**53)


def test_canonical_json_maps_non_finite_to_receipt_error():
    for bad in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ReceiptError):
            canonical_json(bad)


def test_object_keys_sorted_by_utf16_not_codepoint():
    # RFC 8785 sorts keys by UTF-16 code units, NOT Unicode code points — and the
    # two disagree here. U+1F600 (😀) is the surrogate pair D83D DE00 in UTF-16;
    # its first unit 0xD83D sorts BEFORE U+FFFF (0xFFFF). Code-point order would put
    # U+FFFF first, so this case proves the canonicalizer uses UTF-16 ordering.
    out = rfc8785.dumps({"\U0001f600": 1, "￿": 2})
    assert out == '{"\U0001f600":1,"￿":2}'.encode("utf-8")
