"""Portal read-only hash inspection (lab/inspect.py).

Proves the surface (1) returns correct metadata, canonical slots, validation status, and
safe source refs for valid receipts; (2) reports validation failure for tampered receipts;
(3) is *structurally* read-only — the path-based connection physically rejects writes and
the surface exposes no register/dispatch/close verb.
"""
import json
import sqlite3

import pytest

from lab.citation import cite, make_bundle_citation
from lab.errors import NotFound, ReceiptError
from lab.inspect import inspect_hash, inspect_hash_at
from lab.receipt import SLOTS
from lab.store import append, append_receipt, connect


def _base(**extra):
    base = dict(
        who="dan", did="rested", this="slept_well", when="2026-05-17T07:30:00Z",
        confirmed_by="dan", if_ok="continue_minilab_work", if_doubt="", if_not="",
        status="claimed",
    )
    base.update(extra)
    return base


# ----------------------------------------------------------------- METADATA / SLOTS

def test_inspect_returns_metadata_slots_and_validation():
    db = connect(":memory:")
    receipt = append(db, _base())
    out = inspect_hash(db, receipt["id"])

    assert out["found"] is True
    assert out["read_only"] is True
    assert out["content_hash"] == receipt["id"]
    assert out["metadata"]["tuple_hash"] == receipt["hashes"]["tuple_hash"]
    assert out["metadata"]["content_hash"] == receipt["id"]
    assert out["metadata"]["receipt_version"] == "logline.receipt.v0"
    assert out["metadata"]["algorithm"] == "sha256"
    assert out["metadata"]["inserted_at"]
    assert out["slots"] == {slot: receipt.get(slot, "") for slot in SLOTS}
    assert out["validation"] == {"ok": True, "message": "ok"}


def test_inspect_unknown_hash_raises_not_found():
    db = connect(":memory:")
    with pytest.raises(NotFound):
        inspect_hash(db, "a" * 64)


def test_inspect_rejects_non_hash_input():
    db = connect(":memory:")
    with pytest.raises(ReceiptError, match="not a valid content hash"):
        inspect_hash(db, "not-a-hash")


# ----------------------------------------------------------------- SAFE SOURCE REFS

def test_source_refs_surface_this_slot_hash_and_resolution():
    db = connect(":memory:")
    target = append(db, _base(this="target"))
    pointer = append(db, _base(did="wake_handled", this=target["id"]))
    out = inspect_hash(db, pointer["id"])
    this_refs = [r for r in out["source_refs"] if r["origin"] == "this"]
    assert this_refs and this_refs[0]["hash"] == target["id"]
    assert this_refs[0]["resolves"] is True


def test_source_refs_mark_unresolved_hash():
    db = connect(":memory:")
    pointer = append(db, _base(did="wake_handled", this="f" * 64))
    out = inspect_hash(db, pointer["id"])
    this_refs = [r for r in out["source_refs"] if r["origin"] == "this"]
    assert this_refs[0]["resolves"] is False


def test_inspect_validates_embedded_citation_when_cited_present():
    db = connect(":memory:")
    cited = append(db, _base(this="cited"))
    citing = cite(_base(did="cites", this=cited["id"]), cited, "content_hash")
    append_receipt(db, citing)
    out = inspect_hash(db, citing["id"])
    assert out["citation"]["present"] is True
    assert out["citation"]["kind"] == "content_hash"
    assert out["citation"]["validated"] is True
    cite_refs = [r for r in out["source_refs"] if r["origin"] == "citation"]
    assert cite_refs and cite_refs[0]["hash"] == cited["id"]


def test_inspect_reports_citation_unvalidatable_when_cited_absent():
    db = connect(":memory:")
    cited = append(db, _base(this="cited"))
    citing = cite(_base(did="cites"), cited, "content_hash")
    # Insert ONLY the citing receipt into a fresh ledger; cited is absent.
    db2 = connect(":memory:")
    append_receipt(db2, citing)
    out = inspect_hash(db2, citing["id"])
    assert out["citation"]["validated"] is None
    assert out["citation"]["reason"] == "cited_receipt_not_in_ledger"


def test_inspect_surfaces_bundle_citation_leaves():
    db = connect(":memory:")
    a = append(db, _base(this="a"))
    b = append(db, _base(this="b"))
    bundle = make_bundle_citation([a, b])
    citing = append(db, {**_base(did="bundles"), "citation": bundle})
    out = inspect_hash(db, citing["id"])
    assert out["citation"]["kind"] == "bundle"
    assert out["citation"]["validated"] is True
    bundle_refs = {r["hash"] for r in out["source_refs"] if r["origin"] == "citation.bundle"}
    assert bundle_refs == {a["id"], b["id"]}


# ----------------------------------------------------------------- TAMPER DETECTION

def test_inspect_reports_validation_failure_for_tampered_receipt():
    """Insert a receipt then mutate its stored act body in place (bypassing the append-only
    triggers via a raw row write into a fresh table) and prove inspect flags it invalid."""
    db = connect(":memory:")
    receipt = append(db, _base())
    # Build a tampered act JSON: flip a slot without re-hashing.
    tampered = dict(receipt)
    tampered["status"] = "claimed_x"
    raw = sqlite3.connect(":memory:")
    raw.row_factory = sqlite3.Row
    raw.execute(
        "CREATE TABLE logline_acts (content_hash TEXT, tuple_hash TEXT, receipt_version TEXT, "
        "act TEXT, inserted_at TEXT, envelope_hash TEXT, sent_by TEXT, sent_to TEXT, "
        "sent_at TEXT, channel TEXT)"
    )
    raw.execute(
        "INSERT INTO logline_acts(content_hash, tuple_hash, receipt_version, act, inserted_at) "
        "VALUES(?,?,?,?,?)",
        (receipt["id"], receipt["hashes"]["tuple_hash"], receipt["receipt_version"],
         json.dumps(tampered), "2026-06-26T00:00:00Z"),
    )
    out = inspect_hash(raw, receipt["id"])
    assert out["validation"]["ok"] is False
    assert out["slots"]["status"] == "claimed_x"


# ----------------------------------------------------------------- READ-ONLY PROOF

def test_path_inspection_uses_a_readonly_connection(tmp_path):
    path = tmp_path / "lab.sqlite"
    db = connect(path)
    receipt = append(db, _base())
    db.close()

    out = inspect_hash_at(path, receipt["id"])
    assert out["found"] is True
    assert out["read_only"] is True


def test_readonly_connection_physically_rejects_writes(tmp_path):
    """The structural guarantee: the inspection connection cannot mutate the ledger."""
    from lab.inspect import _readonly_connect

    path = tmp_path / "lab.sqlite"
    db = connect(path)
    append(db, _base())
    db.close()

    ro = _readonly_connect(path)
    with pytest.raises(sqlite3.OperationalError, match="readonly database"):
        ro.execute(
            "INSERT INTO logline_acts(content_hash, tuple_hash, receipt_version, act) "
            "VALUES('x','y','logline.receipt.v0','{}')"
        )
        ro.commit()
    ro.close()


def test_inspect_surface_exposes_no_mutation_verbs():
    """The module's public surface is read-only by construction: it offers no register,
    dispatch, close, append, or queue verb."""
    import lab.inspect as inspect_mod

    public = {name for name in dir(inspect_mod) if not name.startswith("_")}
    forbidden = {"append", "register", "dispatch", "close", "queue_add", "claim", "release",
                 "mint", "executor_run_once"}
    assert public.isdisjoint(forbidden)


def test_inspect_at_missing_ledger_raises_not_found(tmp_path):
    with pytest.raises(NotFound):
        inspect_hash_at(tmp_path / "absent.sqlite", "a" * 64)
