"""Append-only and receipt-v1 storage invariants for the bench SQLite ledger."""
import sqlite3

import pytest

from lab.store import connect, append, count, get_tuple


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered', 'envelope': {},
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
        db.execute("UPDATE logline_acts SET receipt_version = 'tampered' WHERE tuple_hash = ?", (act['hashes']['tuple_hash'],))


def test_delete_on_admitted_receipt_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("DELETE FROM logline_acts WHERE tuple_hash = ?", (act['hashes']['tuple_hash'],))


def test_mutating_the_act_body_aux_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("UPDATE logline_acts SET act = '{}' WHERE tuple_hash = ?", (act['hashes']['tuple_hash'],))


def test_mutating_the_envelope_columns_is_blocked(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.IntegrityError, match='append-only'):
        db.execute("UPDATE logline_acts SET envelope_hash = 'x', sent_to = 'mallory' WHERE tuple_hash = ?", (act['hashes']['tuple_hash'],))


def test_generated_slot_columns_cannot_be_updated_at_all(admitted):
    db, act = admitted
    with pytest.raises(sqlite3.OperationalError, match='generated column'):
        db.execute("UPDATE logline_acts SET status = 'tampered' WHERE tuple_hash = ?", (act['hashes']['tuple_hash'],))


def test_no_mutation_slipped_through(admitted):
    db, act = admitted
    key = act['hashes']['tuple_hash']
    for sql in [
        "UPDATE logline_acts SET receipt_version = 'tampered' WHERE tuple_hash = ?",
        "DELETE FROM logline_acts WHERE tuple_hash = ?",
    ]:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(sql, (key,))
    assert count(db) == 1


def test_same_semantic_content_can_rest_in_two_envelopes():
    """content_hash is semantic identity; tuple_hash is the unique ledger occurrence."""
    db = connect(':memory:')
    chat = append(db, full(envelope={'channel': 'chat'}))
    email = append(db, full(envelope={'channel': 'email'}))

    assert chat['id'] == email['id']
    assert chat['hashes']['content_hash'] == email['hashes']['content_hash']
    assert chat['hashes']['envelope_hash'] != email['hashes']['envelope_hash']
    assert chat['hashes']['tuple_hash'] != email['hashes']['tuple_hash']
    assert count(db) == 2
    assert get_tuple(db, chat['hashes']['tuple_hash'])['envelope'] == {'channel': 'chat'}
    assert get_tuple(db, email['hashes']['tuple_hash'])['envelope'] == {'channel': 'email'}


def test_identical_tuple_is_idempotent():
    db = connect(':memory:')
    first = append(db, full(envelope={'channel': 'chat'}))
    second = append(db, full(envelope={'channel': 'chat'}))
    assert first['hashes']['tuple_hash'] == second['hashes']['tuple_hash']
    assert count(db) == 1
