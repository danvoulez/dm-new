import json
import sqlite3

import pytest

from lab.store import append, connect, get

def test_append_get_in_memory():
    db=connect(':memory:')
    r=append(db, {'who':'tester','did':'registered','this':'store','when':'2026-06-22T00:00:00Z','confirmed_by':'test','if_ok':'','if_doubt':'','if_not':'','status':'registered'})
    assert get(db, r['id'])['this']=='store'


def test_logline_acts_uses_canonical_hash_columns_and_generated_aux():
    db = connect(":memory:")
    receipt = append(
        db,
        {
            "who": "tester",
            "did": "registered",
            "this": "store",
            "when": "2026-06-22T00:00:00Z",
            "confirmed_by": "test",
            "if_ok": "memory-register.v1",
            "if_doubt": "attention-raise.v1",
            "if_not": "stop",
            "status": "registered",
            "process_id": "memory-register.v1",
        },
    )

    row = db.execute(
        """SELECT content_hash, tuple_hash, receipt_version, act, who, if_ok, aux
           FROM logline_acts
           WHERE content_hash = ?""",
        (receipt["id"],),
    ).fetchone()

    assert row["content_hash"] == receipt["hashes"]["content_hash"]
    assert row["tuple_hash"] == receipt["hashes"]["tuple_hash"]
    assert row["receipt_version"] == "logline.receipt.v0"
    assert json.loads(row["act"]) == receipt
    assert row["who"] == "tester"
    assert row["if_ok"] == "memory-register.v1"
    assert json.loads(row["aux"]) == {"process_id": "memory-register.v1"}


def test_logline_acts_is_append_only():
    db = connect(":memory:")
    receipt = append(
        db,
        {
            "who": "tester",
            "did": "registered",
            "this": "store",
            "when": "2026-06-22T00:00:00Z",
            "confirmed_by": "test",
            "if_ok": "",
            "if_doubt": "",
            "if_not": "",
            "status": "registered",
        },
    )

    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        db.execute("UPDATE logline_acts SET receipt_version = receipt_version WHERE content_hash = ?", (receipt["id"],))

    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        db.execute("DELETE FROM logline_acts WHERE content_hash = ?", (receipt["id"],))
