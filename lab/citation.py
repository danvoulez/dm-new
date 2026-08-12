"""Citation composition profile: how one LogLine receipt cites another.

A content hash proves *integrity*, not *reference*. When receipt B wants to point at
receipt A — "this result closes that wake", "this candidate descends from that
question" — it must say **which hash of A it is binding to**, because the choice carries
different meaning and different tamper surface:

  * ``content_hash`` — A's full identity including AUX. The citation breaks if *anything*
    in A changes. Use when you mean "this exact Act, byte-for-byte" (the default and
    strongest binding; A's ``id`` equals its ``content_hash``).
  * ``tuple_hash`` — only A's nine invariant slots. The citation survives AUX edits to A
    but breaks if any slot changes. Use when you mean "the act A asserted" independent of
    incidental metadata. (A re-mint of A with different AUX still satisfies the citation.)
  * ``process_contract_hash`` — not a hash *of A* but of the process contract A activated
    under, carried as an AUX field on A. Use when you cite "the rule A ran under", e.g.
    an audit binding a result to the exact contract version. The cited receipt must
    actually carry that AUX field, and it must match.
  * ``result_hash`` — A's AUX ``result_hash`` field: the content hash of the *result act*
    A produced. Use when you cite "what A concluded" rather than A itself. Same AUX rules.
  * ``bundle`` — a Merkle/DAG bundle over an ordered list of (kind, hash) leaves. Use when
    one citation must bind several receipts at once (a DAG of antecedents). The bundle
    hash is the JCS hash of the canonical leaf list; tampering with any leaf, its kind, or
    the order changes the bundle hash.

This module is deliberately *additive*: a citation is an ordinary AUX record. It never
touches the nine invariant slots — those remain the receipt's runtime anatomy. A citing
receipt simply carries a ``citation`` AUX object (or a ``citations`` list / ``bundle``),
and minting binds it into the citing receipt's own ``content_hash`` like any other AUX.
So a tampered citation is caught twice: ``validate_citation`` rejects it against the cited
receipt here, and the citing receipt's content hash would not reproduce if the AUX were
altered after minting (``receipt.verify``).
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .errors import ReceiptError
from .receipt import canonical_json, mint, sha256_text, verify_or_raise

# The explicit, closed vocabulary of single-target citation kinds. Adding a kind is a
# deliberate spec act, not an accident: an unknown kind is rejected rather than silently
# trusted. ``content_hash``/``tuple_hash`` are hashes *of* the cited receipt;
# ``process_contract_hash``/``result_hash`` are AUX fields the cited receipt must carry.
DIRECT_KINDS = ("content_hash", "tuple_hash", "process_contract_hash", "result_hash")
# AUX-resident kinds are read from the cited receipt's body, not recomputed from its slots.
_AUX_KINDS = {"process_contract_hash", "result_hash"}
BUNDLE_KIND = "bundle"
CITATION_VERSION = "logline.citation.v0"


def _cited_hash(cited: Mapping[str, Any], kind: str) -> str:
    """Return the value of ``kind`` as it stands on the (already-valid) cited receipt."""
    if kind == "content_hash":
        return str(cited["hashes"]["content_hash"])
    if kind == "tuple_hash":
        return str(cited["hashes"]["tuple_hash"])
    if kind in _AUX_KINDS:
        if kind not in cited:
            raise ReceiptError(f"cited receipt carries no {kind} to cite")
        value = cited[kind]
        if not isinstance(value, str):
            raise ReceiptError(f"cited {kind} must be a string")
        return value
    raise ReceiptError(f"unknown citation kind: {kind!r}")


def bundle_hash(leaves: Sequence[Mapping[str, Any]]) -> str:
    """Merkle/DAG bundle hash over an ordered list of ``{kind, hash}`` leaves.

    The hash is taken over the JCS-canonical bytes of the normalized leaf list, so the
    bundle is sensitive to each leaf's kind, each leaf's hash, and their order — the three
    things a DAG of antecedents must not lose. Order is preserved (not sorted): a citation
    DAG is an ordered statement of provenance, and reordering is a different claim.
    """
    if not leaves:
        raise ReceiptError("bundle citation requires at least one leaf")
    normalized: list[dict[str, str]] = []
    for leaf in leaves:
        kind = leaf.get("kind")
        target = leaf.get("hash")
        if kind not in DIRECT_KINDS:
            raise ReceiptError(f"bundle leaf has unknown kind: {kind!r}")
        if not isinstance(target, str) or not target:
            raise ReceiptError("bundle leaf must carry a non-empty hash string")
        normalized.append({"kind": kind, "hash": target})
    return sha256_text(canonical_json({"bundle_version": CITATION_VERSION, "leaves": normalized}))


def make_citation(cited: Mapping[str, Any], kind: str = "content_hash") -> dict[str, Any]:
    """Build a single-target citation AUX object that binds to ``cited`` by ``kind``.

    The cited receipt must itself verify — you cannot cite a malformed Act. The returned
    object is a plain AUX dict; drop it under the ``citation`` key of the citing receipt's
    fields before minting (see ``cite``). It records the kind explicitly so a reader never
    has to guess which hash was bound.
    """
    if kind not in DIRECT_KINDS:
        raise ReceiptError(f"unknown citation kind: {kind!r}")
    verify_or_raise(cited)
    return {
        "citation_version": CITATION_VERSION,
        "kind": kind,
        "cited_hash": _cited_hash(cited, kind),
    }


def make_bundle_citation(cited: Sequence[Mapping[str, Any]], kinds: Sequence[str] | None = None) -> dict[str, Any]:
    """Build a bundle citation binding several cited receipts at once.

    ``kinds`` selects the citation kind per cited receipt (defaults to ``content_hash`` for
    every leaf). Each cited receipt must verify. The leaf order mirrors ``cited`` order and
    is load-bearing in the bundle hash.
    """
    if not cited:
        raise ReceiptError("bundle citation requires at least one cited receipt")
    if kinds is None:
        kinds = ["content_hash"] * len(cited)
    if len(kinds) != len(cited):
        raise ReceiptError("kinds length must match cited length")
    leaves: list[dict[str, str]] = []
    for receipt, kind in zip(cited, kinds):
        if kind not in DIRECT_KINDS:
            raise ReceiptError(f"unknown citation kind: {kind!r}")
        verify_or_raise(receipt)
        leaves.append({"kind": kind, "hash": _cited_hash(receipt, kind)})
    return {
        "citation_version": CITATION_VERSION,
        "kind": BUNDLE_KIND,
        "leaves": leaves,
        "bundle_hash": bundle_hash(leaves),
    }


def cite(fields: Mapping[str, Any], cited: Mapping[str, Any], kind: str = "content_hash") -> dict[str, Any]:
    """Mint a citing receipt: ``fields`` plus a ``citation`` AUX binding to ``cited``.

    The nine slots come from ``fields`` untouched; the citation rides as additive AUX, so
    it is bound into the citing receipt's own ``content_hash`` (any later edit to the
    citation breaks ``receipt.verify``). ``fields`` must not already carry a ``citation``.
    """
    if "citation" in fields:
        raise ReceiptError("fields already carry a citation")
    citation = make_citation(cited, kind)
    return mint({**fields, "citation": citation})


def validate_citation(citation: Mapping[str, Any], cited: Mapping[str, Any]) -> None:
    """Raise ``ReceiptError`` unless ``citation`` correctly binds to ``cited``.

    Validation is total: the cited receipt must verify, the citation must name a known
    kind, and the recorded hash must reproduce from the cited receipt under that kind. Any
    tamper — a flipped ``cited_hash``, a swapped ``kind``, an edited cited slot/AUX, a
    mutated bundle leaf or reordered leaves — is caught here.
    """
    if citation.get("citation_version") != CITATION_VERSION:
        raise ReceiptError("unsupported citation_version")
    verify_or_raise(cited)
    kind = citation.get("kind")
    if kind in DIRECT_KINDS:
        expected = _cited_hash(cited, kind)
        if citation.get("cited_hash") != expected:
            raise ReceiptError(f"citation {kind} mismatch")
        return
    if kind == BUNDLE_KIND:
        raise ReceiptError("bundle citations require validate_bundle_citation with all cited receipts")
    raise ReceiptError(f"unknown citation kind: {kind!r}")


def validate_bundle_citation(citation: Mapping[str, Any], cited: Sequence[Mapping[str, Any]]) -> None:
    """Raise ``ReceiptError`` unless a bundle ``citation`` binds to ``cited`` in order.

    ``cited`` must be the receipts in the same order as the bundle leaves. Each leaf is
    re-derived from its cited receipt under the leaf's kind, the bundle hash is recomputed,
    and both the per-leaf hashes and the recomputed bundle hash must match what the citation
    recorded — so a tampered leaf, a reordered DAG, or a forged bundle hash all fail.
    """
    if citation.get("citation_version") != CITATION_VERSION:
        raise ReceiptError("unsupported citation_version")
    if citation.get("kind") != BUNDLE_KIND:
        raise ReceiptError("not a bundle citation")
    leaves = citation.get("leaves")
    if not isinstance(leaves, list) or not leaves:
        raise ReceiptError("bundle citation has no leaves")
    if len(cited) != len(leaves):
        raise ReceiptError("cited count does not match bundle leaf count")
    rederived: list[dict[str, str]] = []
    for leaf, receipt in zip(leaves, cited):
        verify_or_raise(receipt)
        kind = leaf.get("kind")
        if kind not in DIRECT_KINDS:
            raise ReceiptError(f"unknown bundle leaf kind: {kind!r}")
        expected = _cited_hash(receipt, kind)
        if leaf.get("hash") != expected:
            raise ReceiptError(f"bundle leaf {kind} mismatch")
        rederived.append({"kind": kind, "hash": expected})
    if citation.get("bundle_hash") != bundle_hash(rederived):
        raise ReceiptError("bundle_hash mismatch")
