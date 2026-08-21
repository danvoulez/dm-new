"""Citation composition profile: how one LogLine receipt cites another.

A content hash proves *integrity*, not *reference*. When receipt B wants to point at
receipt A — "this result closes that wake", "this candidate descends from that
question" — it must say **which identity of A it is binding to**, because v1 separates
semantic content from process/envelope context:

  * ``content_hash`` — A's semantic identity: the nine LogLine fields plus AUX. The
    citation survives moving the exact same semantic Act into a different envelope, but
    breaks if a slot or AUX changes. A's ``id`` equals this hash.
  * ``tuple_hash`` — A's exact ledger occurrence/context: ``H(content_hash +
    envelope_hash)``. It breaks if either semantic content or envelope changes. Use this
    when you mean "this occurrence of A in this process/custody context".
  * ``process_contract_hash`` — not a hash *of A* but of the process contract A activated
    under, carried as an AUX field on A. Use when you cite "the rule A ran under".
  * ``result_hash`` — A's AUX ``result_hash`` field: the content hash of the result Act A
    produced. Use when you cite "what A concluded" rather than A itself.
  * ``bundle`` — a Merkle/DAG bundle over an ordered list of (kind, hash) leaves. Use when
    one citation must bind several receipts at once. The bundle hash is the JCS hash of
    the canonical leaf list; tampering with any leaf, its kind, or order changes it.

A citation is ordinary AUX. Minting therefore binds it into the citing Act's own
``content_hash``. Envelope/context remains an orthogonal identity layer.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .errors import ReceiptError
from .receipt import canonical_json, mint, sha256_text, verify_or_raise

# The explicit, closed vocabulary of single-target citation kinds. Adding a kind is a
# deliberate spec act, not an accident: an unknown kind is rejected rather than silently
# trusted. content_hash names semantic Act identity; tuple_hash names the exact contextual
# occurrence. AUX-resident kinds name explicit semantic references carried by the Act.
DIRECT_KINDS = ("content_hash", "tuple_hash", "process_contract_hash", "result_hash")
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

    The nine slots and envelope come from ``fields`` untouched; citation rides as additive
    AUX and is therefore bound into the citing receipt's semantic ``content_hash``.
    ``fields`` must not already carry a ``citation``.
    """
    if "citation" in fields:
        raise ReceiptError("fields already carry a citation")
    citation = make_citation(cited, kind)
    return mint({**fields, "citation": citation})


def validate_citation(citation: Mapping[str, Any], cited: Mapping[str, Any]) -> None:
    """Raise ``ReceiptError`` unless ``citation`` correctly binds to ``cited``.

    Validation is total: the cited receipt must verify, the citation must name a known
    kind, and the recorded hash must reproduce from the cited receipt under that kind.
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
    recorded.
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
