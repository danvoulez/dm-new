"""Day 2 §10 — dangerous work requires a real grant (catalog-level matrix).

Per-failure grant behavior (expired/revoked/budget/scope/subject/process/signoff) is proven
in test_runtime.py / test_grants.py / test_signing.py. This file pins the *matrix*: the
danger-tier of every process, and the invariant that L4/L5 cannot activate without a grant
while L0-L3 never demand one. Adding or retiering a process forces a conscious update here.
"""
from lab.contracts import load_catalog
from lab.evaluator import evaluate

DANGEROUS = {'L4', 'L5'}

# The official danger classification of the current catalog (mirrors docs/DANGER_TIERS.md).
EXPECTED_TIERS = {
    'attention-raise.v1': 'L0',
    'evidence-closure.v1': 'L0',
    'github-check.v1': 'L0',      # contract-only until the GitHub App door (Day 6)
    'notification.v1': 'L5',      # §20 — first irreversible outbound effect
    'memory-register.v1': 'L0',
    'projection-build.v1': 'L1',
    'inference.v1': 'L3',
    'oauth-client.v1': 'L3',      # kernel builds the request (dry-run); the edge POST needs the secret key
    'route-to-devin.v1': 'L4',    # §21 — dangerous external delegation
    'worker-run.v1': 'L4',
    'workflow-run.v1': 'L5',
}


# Some processes require activation aux before the grant gate is even reached.
REQUIRED_AUX = {
    'route-to-devin.v1': {'target_content_hash': 'd' * 64, 'target_process': 'worker-run.v1'},
}


def full(pid, **extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': pid, 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered', 'process_id': pid,
    }
    base.update(REQUIRED_AUX.get(pid, {}))
    base.update(extra)
    return base


def test_catalog_danger_tiers_match_the_official_matrix():
    actual = {pid: c.danger_tier for pid, c in load_catalog().items()}
    assert actual == EXPECTED_TIERS


def test_l4_l5_processes_cannot_activate_without_a_grant():
    for pid, tier in EXPECTED_TIERS.items():
        if tier not in DANGEROUS:
            continue
        out = evaluate(full(pid), pid)
        assert out['danger_tier'] == tier
        assert out['activate'] is False
        assert out['reason'] == 'missing_required_grant'


def test_non_dangerous_processes_never_demand_a_grant():
    for pid, tier in EXPECTED_TIERS.items():
        if tier in DANGEROUS:
            continue
        out = evaluate(full(pid), pid)
        assert out['reason'] != 'missing_required_grant'
