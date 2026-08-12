"""Day 1 regressions — Selectors select. Executor dispatches. Contracts choose adapters.

These tests pin the central activation law (LAB roadmap, Dia 1):

  - the adapter that reaches the queue is the one the *contract* resolved
    (``decision['adapter']``), never a universal ``receipt`` fallback;
  - a matched-but-adapterless contract (contract-only) does NOT run — it is
    doubted with ``no_adapter_configured``, never enqueued as a receipt;
  - the executor revalidates the queued adapter against the contract and refuses
    a ``dispatch_mismatch`` rather than executing a corrupted queue row.
"""
from lab.store import connect, append, get
from lab.evaluator import evaluate
from lab.runtime import receiver_select, queue_list, queue_add, executor_run_once


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'runtime',
        'when': '2026-06-22T00:00:00Z', 'confirmed_by': 'test',
        'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


def test_projection_build_enqueues_projection_adapter_not_receipt():
    """Task 5: projection-build.v1 must queue with adapter 'projection'."""
    db = connect(':memory:')
    append(db, full(if_ok='projection-build.v1'))
    receiver_select(db, 'projection-build.v1')
    queued = queue_list(db, 'all')
    assert len(queued) == 1
    assert queued[0]['process_id'] == 'projection-build.v1'
    assert queued[0]['adapter'] == 'projection'


def test_evaluator_blocks_matched_contract_without_adapter():
    """Task 4/11: a matched, complete, active contract with no adapter is not runnable."""
    out = evaluate(full(if_ok='attention-raise.v1'), 'attention-raise.v1')
    assert out['matched'] is True
    assert out['activate'] is False
    assert out['queueable'] is False
    assert out['reason'] == 'no_adapter_configured'


def test_contract_only_does_not_enqueue_as_receipt():
    """Task 6: a complete contract-only Act is doubted, never queued as a receipt."""
    db = connect(':memory:')
    act = append(db, full(if_ok='attention-raise.v1'))
    selected = receiver_select(db, 'attention-raise.v1')

    assert queue_list(db, 'all') == []
    assert selected[0]['queued'] is None
    assert selected[0]['doubt']

    doubt = get(db, selected[0]['doubt'])
    assert doubt['did'] == 'doubt'
    assert doubt['this'] == act['id']
    assert doubt['reason'] == 'no_adapter_configured'


def test_day1_canonical_doubt_reasons_are_declared():
    """Task 11: the reasons the runtime emits belong to a stable, closed vocabulary."""
    from lab.runtime import DOUBT_REASONS
    for reason in (
        'no_adapter_configured', 'adapter_not_registered', 'dispatch_mismatch',
        'incomplete', 'missing_required_grant', 'evidence_obligation_unmet',
    ):
        assert reason in DOUBT_REASONS


def test_executor_refuses_dispatch_when_queue_adapter_mismatches_contract():
    """Task 10: a corrupted queue row (wrong adapter) is refused, not executed."""
    db = connect(':memory:')
    act = append(db, full(if_ok='projection-build.v1'))
    # Queue claims 'receipt' but the contract resolves 'projection' — a mismatch.
    queue_add(db, act['id'], 'projection-build.v1', adapter='receipt')

    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])

    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'dispatch_mismatch'
    assert queue_list(db, 'failed') == []
