"""Day 2 §9 — a resting Act carries no consequence.

`transport`, `result`, and `evidence` do not belong on a resting Act. They are refused at
two layers: the receipt mint (ReceiptError) and the DB CHECK (IntegrityError, defense in
depth for a raw insert that bypasses mint). Consequence never enters hidden in the body.
"""
import json
import sqlite3

import pytest

from lab.errors import ReceiptError
from lab.receipt import FORBIDDEN, canonical_json, mint
from lab.store import connect, append


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


@pytest.mark.parametrize('field', sorted(FORBIDDEN))  # transport, result, evidence
def test_mint_layer_rejects_forbidden_top_level_field(field):
    with pytest.raises(ReceiptError, match='forbidden top-level field'):
        append(connect(':memory:'), full(**{field: {'smuggled': True}}))


@pytest.mark.parametrize('field', sorted(FORBIDDEN))
def test_db_check_rejects_forbidden_field_even_when_mint_is_bypassed(field):
    db = connect(':memory:')
    receipt = mint(full())
    act = json.loads(canonical_json(receipt))
    act[field] = {'smuggled': True}  # inject AFTER minting, straight into the row
    with pytest.raises(sqlite3.IntegrityError, match='CHECK constraint failed'):
        db.execute(
            "INSERT INTO logline_acts(content_hash, tuple_hash, receipt_version, act) VALUES(?, ?, ?, ?)",
            (receipt['id'], receipt['hashes']['tuple_hash'], receipt['receipt_version'], json.dumps(act)),
        )


def test_resting_act_with_correct_envelope_is_accepted():
    # A routed ("sent") act keeps routing in the envelope/slots — never a transport field
    # in the body. It is admitted and its body carries none of the forbidden fields.
    db = connect(':memory:')
    sent = append(db, full(did='message', this='hello', if_ok='peer.frequency', status='sent'))
    body = {k: v for k, v in sent.items()}
    assert not FORBIDDEN.intersection(body)
    assert body['if_ok'] == 'peer.frequency'  # routing rides on the slot, not on transport
