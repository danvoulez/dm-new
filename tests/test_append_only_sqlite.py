"""Day 2 §7 — the bench SQLite ledger really blocks mutation.

Regression locks on the append-only guarantee: an admitted receipt cannot be updated or
deleted, its derived AUX/slots cannot be rewritten, and its envelope columns are frozen.
The ledger does not allow rewriting history.
"""
import sqlite3

import pytest

from lab.store import connect, append, count


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


@pytest.fixture
def admitted():
    db = connect(':memory:')
    act = append(db, full())
    return db, act


def test_update_on_admitted_receipt_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("UPDATE logline_acts SET receipt_version = 'tampered' WHERE content_hash = ?", (act['id'],))


def test_delete_on_admitted_receipt_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("DELETE FROM logline_acts WHERE content_hash = ?", (act['id'],))


def test_mutating_the_act_body_aux_is_blocked(admitted):
    db, act = admitted
    # AUX is derived from the act body; rewriting the body is what an attacker would try.
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("UPDATE logline_acts SET act = '{}' WHERE content_hash = ?", (act['id'],))


def test_mutating_the_envelope_columns_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("UPDATE logline_acts SET envelope_hash = 'x', sent_to = 'mallory' WHERE content_hash = ?", (act['id'],))


def test_generated_slot_columns_cannot_be_updated_at_all(admitted):
    # Derived slots (who, did, status, ...) are generated columns: SQLite refuses to
    # update them outright, a layer of immutability independent of the append-only trigger.
    db, act = admitted
    with pytest.raises(sqlite3.OperationalError, match='generated column'):
        db.execute("UPDATE logline_acts SET status = 'tampered' WHERE content_hash = ?", (act['id'],))


def test_no_mutation_slipped_through(admitted):
    db, act = admitted
    for sql, params in [
        ("UPDATE logline_acts SET receipt_version = 'tampered' WHERE content_hash = ?", (act['id'],)),
        ("DELETE FROM logline_acts WHERE content_hash = ?", (act['id'],)),
    ]:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(sql, params)
    assert count(db) == 1
