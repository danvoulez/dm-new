from lab.errors import ReceiptError
from lab.receipt import mint, verify


def test_mint_and_verify_receipt():
    r = mint({'who':'tester','did':'registered','this':'thing','when':'2026-06-22T00:00:00Z','confirmed_by':'test','if_ok':'next','if_doubt':'doubt','if_not':'stop','status':'registered'})
    ok, msg = verify(r)
    assert ok, msg
    assert r['id'] == r['hashes']['content_hash']


def test_forbidden_top_level_transport():
    try:
        mint({'transport': {}})
    except ReceiptError as e:
        assert 'forbidden' in str(e)
    else:
        raise AssertionError('expected forbidden transport')


def test_slot_values_must_be_strings():
    ok, msg = verify(mint({'who':'tester'}) | {'who': 7})
    assert not ok
    assert 'must be a string' in msg
