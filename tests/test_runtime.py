import pytest

from lab.errors import AdapterError, Conflict
from lab.store import connect, append, get
from lab.evaluator import evaluate
from lab.runtime import queue_add, queue_list, executor_run_once, receiver_select, set_service_paused
from lab.grants import register_grant, revoke_grant
from lab.authority import register_genesis_authority


def full(**extra):
    base = {'who':'tester','did':'registered','this':'runtime','when':'2026-06-22T00:00:00Z','confirmed_by':'test','if_ok':'memory-register.v1','if_doubt':'attention-raise.v1','if_not':'stop','status':'registered'}
    base.update(extra)
    return base


def test_evaluator_activates_complete_contract():
    out = evaluate(full(), 'memory-register.v1')
    assert out['activate'] is True
    assert out['activation_state'] == 'ativável'
    assert out['queueable'] is True


def test_evaluator_freezes_incomplete_record():
    r = full(who='')
    out = evaluate(r, 'memory-register.v1')
    assert out['activate'] is False and 'who' in out['missing_slots']
    assert out['activation_state'] == 'incompleto'
    assert out['queueable'] is False


def test_evaluator_reports_missing_required_aux_for_route_to_devin():
    out = evaluate(full(process_id='route-to-devin.v1'), 'route-to-devin.v1')
    assert out['activate'] is False
    assert out['activation_state'] == 'incompleto'
    assert out['missing_aux'] == ['target_content_hash', 'target_process']
    assert out['queueable'] is False


def test_evaluator_blocks_dangerous_worker_without_grant():
    out = evaluate(full(process_id='worker-run.v1'), 'worker-run.v1')
    assert out['activate'] is False
    assert out['activation_state'] == 'doubted'
    assert out['reason'] == 'missing_required_grant'
    assert out['queueable'] is False


def test_queue_is_idempotent_per_source_process_adapter():
    db = connect(':memory:')
    act = append(db, full())
    q1 = queue_add(db, act['id'], 'memory-register.v1')
    q2 = queue_add(db, act['id'], 'memory-register.v1')
    assert q1['queue_id'] == q2['queue_id']
    assert len(queue_list(db, 'all')) == 1


def test_queue_and_executor_close_with_result_receipt():
    db = connect(':memory:')
    act = append(db, full())
    q = queue_add(db, act['id'], 'memory-register.v1')
    assert queue_list(db)[0]['queue_id'] == q['queue_id']
    closed = executor_run_once(db)
    assert closed['status'] == 'closed' and closed['result_hash']
    result = get(db, closed['result_hash'])
    assert result['queue_id'] == q['queue_id']
    assert result['status'] == 'fechado'
    assert result['external_effect'] is False


def test_executor_writes_processando_before_adapter_result():
    db = connect(':memory:')
    act = append(db, full())
    q = queue_add(db, act['id'], 'memory-register.v1')
    closed = executor_run_once(db)

    processando = db.execute(
        "SELECT act FROM logline_acts WHERE status = 'processando' AND json_extract(act, '$.queue_id') = ?",
        (q['queue_id'],),
    ).fetchone()
    assert processando is not None
    assert get(db, closed['result_hash'])['status'] == 'fechado'


def test_executor_re_evaluates_and_closes_incomplete_work_without_dispatch():
    db = connect(':memory:')
    act = append(db, full(process_id='route-to-devin.v1'))
    q = queue_add(db, act['id'], 'route-to-devin.v1', adapter='missing')

    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])

    assert closed['status'] == 'closed'
    assert result['status'] == 'incompleto'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'incomplete'
    assert result['missing_aux'] == ['target_content_hash', 'target_process']
    assert queue_list(db, 'failed') == []


def test_executor_refuses_worker_run_without_grant_before_adapter_dispatch():
    db = connect(':memory:')
    act = append(db, full(process_id='worker-run.v1', if_ok='worker-run.v1'))
    q = queue_add(db, act['id'], 'worker-run.v1', adapter='missing')

    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])

    assert closed['status'] == 'closed'
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'missing_required_grant'
    assert result['danger_tier'] == 'L4'
    assert queue_list(db, 'failed') == []


def granted_worker(db, *, grant=None, **source_extra):
    """Register a valid grant and a worker-run source Act that references it by id.

    Authority lives on the GRANT (§13), not the requesting Act — the source carries
    only ``grant_id``. Override single grant fields via ``grant={...}`` to exercise a
    specific verification failure.
    """
    grant_fields = dict(
        process='worker-run.v1',
        granted_by='dan@minilab.work',
        granted_to='tester',  # matches full()'s who
        adapter='*',
        valid_until='2099-01-01T00:00:00Z',
        acu_limit=1,
        timeout_seconds=30,
        fs_scope='/Lab/workers/test',
        network_policy='none',
    )
    grant_fields.update(grant or {})
    # The grant's signer must be a recognized authority (registered structure, §13).
    register_genesis_authority(db, grant_fields['granted_by'] or 'dan@minilab.work')
    g = register_grant(db, **grant_fields)
    act = append(db, full(process_id='worker-run.v1', if_ok='worker-run.v1', grant_id=g['id'], **source_extra))
    return act, g


def test_executor_refuses_unresolvable_grant_id():
    db = connect(':memory:')
    # A grant_id that names no registered grant — self-asserted authority is dead.
    act = append(db, full(process_id='worker-run.v1', if_ok='worker-run.v1', grant_id='grant:does-not-exist'))
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'grant_not_found'


def test_executor_refuses_grant_issued_to_another_subject():
    db = connect(':memory:')
    act, _ = granted_worker(db, grant={'granted_to': 'someone-else'})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'grant_subject_mismatch'


def test_executor_refuses_grant_for_another_process():
    db = connect(':memory:')
    act, _ = granted_worker(db, grant={'process': 'workflow-run.v1'})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'grant_process_mismatch'


def test_executor_refuses_grant_without_authority_signer():
    db = connect(':memory:')
    # The root-of-trust seam: an empty granted_by is refused (not a silent no-op).
    act, _ = granted_worker(db, grant={'granted_by': ''})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'missing_authority'


def test_executor_refuses_grant_from_unregistered_authority():
    db = connect(':memory:')
    # A real authority exists, but the grant's signer ('mallory') was never registered.
    register_genesis_authority(db, 'dan@minilab.work')
    g = register_grant(
        db, process='worker-run.v1', granted_by='mallory', granted_to='tester', adapter='*',
        valid_until='2099-01-01T00:00:00Z', acu_limit=1, timeout_seconds=30,
        fs_scope='/Lab/workers/test', network_policy='none',
    )
    act = append(db, full(process_id='worker-run.v1', if_ok='worker-run.v1', grant_id=g['id']))
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'unregistered_authority'


def test_executor_refuses_expired_dangerous_grant_before_dispatch():
    db = connect(':memory:')
    act, _ = granted_worker(db, grant={'valid_until': '2000-01-01T00:00:00Z'})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'grant_expired'
    assert queue_list(db, 'failed') == []


def test_executor_refuses_budget_exhaustion_before_dispatch():
    db = connect(':memory:')
    act, _ = granted_worker(db, grant={'acu_limit': 0})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'budget_exhausted'
    assert result['budget_required'] == 1


def test_executor_refuses_missing_sandbox_scope_before_dispatch():
    db = connect(':memory:')
    act, _ = granted_worker(db, grant={'fs_scope': ''})
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'missing_sandbox_scope'


def test_executor_refuses_revoked_grant():
    db = connect(':memory:')
    act, g = granted_worker(db)
    revoke_grant(db, g['id'], revoked_by='dan@minilab.work')
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['reason'] == 'grant_revoked'


def test_executor_blocks_valid_but_unsigned_grant():
    db = connect(':memory:')
    # Grant is structurally valid, but L4/L5 now also requires a verified passkey
    # signoff. No signoff recorded -> fail-closed with grant_unsigned (no crypto needed
    # to detect the absence). The signed happy path is proven in test_signing.py.
    act, _ = granted_worker(db)
    queue_add(db, act['id'], 'worker-run.v1', adapter='missing')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'grant_unsigned'


def test_receiver_is_selector_only_and_queues_addressed_complete_record_once():
    db = connect(':memory:')
    act = append(db, full(if_ok='memory-register.v1'))
    selected = receiver_select(db, 'memory-register.v1')
    selected_again = receiver_select(db, 'memory-register.v1')
    assert selected[0]['hash'] == act['id']
    assert selected_again[0]['queued']['queue_id'] == selected[0]['queued']['queue_id']
    assert queue_list(db)[0]['source_hash'] == act['id']


def test_receiver_raises_durable_idempotent_doubt_for_unfulfillable_tap():
    db = connect(':memory:')
    # A tap that reaches the receiver (it addressed a real frequency) but cannot be
    # served: addressed to memory-register.v1 yet incomplete. Per Universal Inbox v3
    # §6 every tap is receipted; per LAB FINAL spec a non-servable wake is doubted,
    # never a silent drop.
    act = append(db, full(if_ok='memory-register.v1', who=''))
    first = receiver_select(db, 'memory-register.v1')
    second = receiver_select(db, 'memory-register.v1')

    assert first[0]['queued'] is None
    assert first[0]['doubt']  # a durable doubt receipt hash
    assert second[0]['doubt'] == first[0]['doubt']  # idempotent across cold-start re-pulls

    doubts = db.execute(
        "SELECT 1 FROM logline_acts WHERE did='doubt' AND this=?", (act['id'],)
    ).fetchall()
    assert len(doubts) == 1

    doubt = get(db, first[0]['doubt'])
    assert doubt['status'] == 'doubted'
    assert doubt['did'] == 'doubt'
    assert doubt['this'] == act['id']
    assert doubt['who'] == 'runtime.receiver'
    assert doubt['reason'] == 'incomplete'
    assert 'who' in doubt['missing_slots']


def test_receiver_activatable_record_is_not_doubted():
    db = connect(':memory:')
    append(db, full(if_ok='memory-register.v1'))
    selected = receiver_select(db, 'memory-register.v1')
    assert selected[0]['queued'] is not None
    assert selected[0]['doubt'] is None
    count = db.execute("SELECT COUNT(*) c FROM logline_acts WHERE did='doubt'").fetchone()['c']
    assert count == 0


def test_executor_pause_blocks_dispatch():
    db = connect(':memory:')
    act = append(db, full())
    queue_add(db, act['id'], 'memory-register.v1')
    set_service_paused(db, 'executor', True, 'maintenance')
    with pytest.raises(Conflict):
        executor_run_once(db)


def test_executor_refuses_contract_adapter_without_registered_implementation(monkeypatch):
    import lab.adapters as adapters_mod
    db = connect(':memory:')
    # projection-build.v1 (L1, no grant) declares adapter 'projection'. Simulate its
    # implementation not being registered (e.g. before it is built / after it is pulled).
    # The executor re-evaluates and fails closed with a durable doubt BEFORE reaching the
    # adapter — it never enqueues-then-crashes, and the queue is resolved, not marked failed.
    act = append(db, full(if_ok='projection-build.v1', process_id='projection-build.v1'))
    queue_add(db, act['id'], 'projection-build.v1', adapter='projection')
    monkeypatch.delitem(adapters_mod.REGISTRY, 'projection')
    closed = executor_run_once(db)
    result = get(db, closed['result_hash'])
    assert result['status'] == 'doubted'
    assert result['did'] == 'not_dispatched'
    assert result['reason'] == 'adapter_not_registered'
    assert queue_list(db, 'failed') == []


def test_run_adapter_rejects_unknown_adapter_name():
    # Defensive layer: even though the selector/executor gate unregistered adapters before
    # dispatch, run_adapter itself still refuses an unknown name rather than no-op.
    from lab.adapters import run_adapter
    with pytest.raises(AdapterError):
        run_adapter('missing', {}, {'queue_id': 'q', 'source_hash': 's', 'process_id': 'p'})
