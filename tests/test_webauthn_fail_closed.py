"""Day 2 §12 — crypto optional, never a bypass.

If the WebAuthn/passkey extra is not installed, dangerous (L4/L5) work must fail **closed**:
the absence of the cryptographic binding layer reduces *capability*, never *security*. These
tests run WITHOUT needing the crypto extra — they force the import seam to be unavailable and
assert the kernel blocks rather than accepts.
"""
import sys

import pytest

from lab.authority import register_genesis_authority, verify_signature
from lab.grants import record_grant_signoff, register_grant, require_grant_signoff
from lab.runtime import executor_run_once, queue_add
from lab.store import append, connect, get


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'worker-run.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


def _no_crypto(monkeypatch):
    """Force the optional signing extra to look uninstalled (ImportError on import)."""
    monkeypatch.setitem(sys.modules, 'lab.signing.webauthn_verifier', None)


def test_verify_signature_reports_layer_unavailable_without_crypto(monkeypatch):
    _no_crypto(monkeypatch)
    ok, reason = verify_signature(
        connect(':memory:'), content_hash='a' * 64, identity='dan@minilab.work', credential={}
    )
    assert ok is False
    assert reason == 'signature_layer_unavailable'


def test_require_grant_signoff_fails_closed_without_crypto(monkeypatch):
    db = connect(':memory:')
    register_genesis_authority(db, 'dan@minilab.work')
    grant = register_grant(
        db, process='worker-run.v1', granted_by='dan@minilab.work', granted_to='tester',
        adapter='*', valid_until='2099-01-01T00:00:00Z', acu_limit=1, timeout_seconds=30,
        fs_scope='/Lab/workers/test', network_policy='none',
    )
    # A signoff IS recorded (recording needs no crypto), signer matches — so the ONLY thing
    # left is the cryptographic verification, which is unavailable.
    record_grant_signoff(db, grant['id'], signer='dan@minilab.work', credential={'fake': True})
    _no_crypto(monkeypatch)
    ok, reason = require_grant_signoff(db, grant)
    assert ok is False
    assert reason == 'signature_layer_unavailable'


def test_executor_blocks_dangerous_work_when_crypto_absent(monkeypatch):
    db = connect(':memory:')
    register_genesis_authority(db, 'dan@minilab.work')
    grant = register_grant(
        db, process='worker-run.v1', granted_by='dan@minilab.work', granted_to='tester',
        adapter='*', valid_until='2099-01-01T00:00:00Z', acu_limit=1, timeout_seconds=30,
        fs_scope='/Lab/workers/test', network_policy='none',
    )
    record_grant_signoff(db, grant['id'], signer='dan@minilab.work', credential={'fake': True})
    act = append(db, full(process_id='worker-run.v1', grant_id=grant['id']))
    queue_add(db, act['id'], 'worker-run.v1', adapter='worker_run')

    _no_crypto(monkeypatch)
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'signature_layer_unavailable'  # blocked, never bypassed
