"""Day 2 §3-6 — bench bootstrap: reproducible local ledger, safe reset, genesis, mode.

The bench is a trustworthy workbench: a new machine can create a clean local ledger from
nothing, reset is impossible to confuse with production, every bench ledger begins with an
explicit genesis act, and destructive work is gated behind LAB_MODE=bench.
"""
import pytest

from lab.errors import BootstrapError, LabError
from lab.store import connect, append, count, get
from lab.bootstrap import (
    BENCH_MODE,
    bootstrap_local,
    genesis_local,
    lab_mode,
    package_version,
    reset_bench,
)


def full(**extra):
    base = {
        'who': 'tester', 'did': 'registered', 'this': 'x', 'when': '2026-06-22T00:00:00Z',
        'confirmed_by': 'test', 'if_ok': 'memory-register.v1', 'if_doubt': 'attention-raise.v1',
        'if_not': 'stop', 'status': 'registered',
    }
    base.update(extra)
    return base


# --- §6 mode ---------------------------------------------------------------

def test_lab_mode_defaults_to_bench(monkeypatch):
    monkeypatch.delenv('LAB_MODE', raising=False)
    assert lab_mode() == BENCH_MODE == 'bench'


# --- §3 reproducible local bootstrap --------------------------------------

def test_bootstrap_local_creates_healthy_empty_ledger(tmp_path):
    db_path = tmp_path / '.lab' / 'test.sqlite'
    out = bootstrap_local(str(db_path))
    assert out['ok'] is True
    assert out['count'] == 0
    assert out['schema_version'] == 3
    assert db_path.exists()


def test_bootstrap_local_is_idempotent(tmp_path):
    db_path = tmp_path / '.lab' / 'test.sqlite'
    bootstrap_local(str(db_path))
    out = bootstrap_local(str(db_path))  # second run must not raise or wipe
    assert out['ok'] is True
    assert out['count'] == 0


# --- §4 safe reset ---------------------------------------------------------

def test_reset_bench_refuses_path_outside_repo(tmp_path, monkeypatch):
    monkeypatch.setenv('LAB_MODE', 'bench')
    with pytest.raises(BootstrapError):
        reset_bench(str(tmp_path / 'elsewhere.sqlite'), repo_root=tmp_path / 'repo')


def test_reset_bench_refuses_real_local_ledger_name(tmp_path, monkeypatch):
    monkeypatch.setenv('LAB_MODE', 'bench')
    with pytest.raises(BootstrapError):
        reset_bench(str(tmp_path / '.lab' / 'lab.sqlite'), repo_root=tmp_path)


@pytest.mark.parametrize('bad', ['', '/', '~'])
def test_reset_bench_refuses_dangerous_paths(bad, monkeypatch, tmp_path):
    monkeypatch.setenv('LAB_MODE', 'bench')
    with pytest.raises(BootstrapError):
        reset_bench(bad, repo_root=tmp_path)


def test_reset_bench_refused_outside_bench_mode(tmp_path, monkeypatch):
    monkeypatch.setenv('LAB_MODE', 'production')
    target = tmp_path / '.lab' / 'test.sqlite'
    bootstrap_local(str(target))
    with pytest.raises(BootstrapError):
        reset_bench(str(target), repo_root=tmp_path)


def test_reset_bench_recreates_empty_schema_and_reports_target(tmp_path, monkeypatch):
    monkeypatch.setenv('LAB_MODE', 'bench')
    target = tmp_path / '.lab' / 'test.sqlite'
    db = connect(str(target))
    append(db, full())
    assert count(db) == 1
    db.close()

    out = reset_bench(str(target), repo_root=tmp_path)
    assert out['ok'] is True
    assert str(target) in out['reset']  # the target is shown
    assert count(connect(str(target))) == 0


# --- §5 genesis ------------------------------------------------------------

def test_genesis_local_registers_first_bench_act(tmp_path):
    db = connect(str(tmp_path / '.lab' / 'test.sqlite'))
    receipt = genesis_local(db)
    assert receipt['did'] == 'genesis'
    assert receipt['lab_mode'] == 'bench'
    assert receipt['package_version'] == package_version()
    assert count(db) == 1
    assert get(db, receipt['id'])['did'] == 'genesis'


def test_genesis_local_is_idempotent(tmp_path):
    db = connect(str(tmp_path / '.lab' / 'test.sqlite'))
    first = genesis_local(db)
    second = genesis_local(db)
    assert first['id'] == second['id']
    assert count(db) == 1


def test_genesis_refuses_when_ledger_already_has_other_acts(tmp_path):
    db = connect(str(tmp_path / '.lab' / 'test.sqlite'))
    append(db, full())
    with pytest.raises(BootstrapError):
        genesis_local(db)


# --- CLI surface -----------------------------------------------------------

def test_cli_bootstrap_local_then_genesis_then_status(tmp_path, monkeypatch):
    from lab import cli

    monkeypatch.setenv('LAB_MODE', 'bench')
    db = str(tmp_path / '.lab' / 'test.sqlite')

    def cli_run(argv):
        return cli.run(cli.build_parser().parse_args(argv))

    local = cli_run(['bootstrap', 'local', '--db', db])
    assert local['ok'] is True and local['count'] == 0

    genesis = cli_run(['bootstrap', 'genesis', '--db', db])
    assert genesis['did'] == 'genesis'

    status = cli_run(['bootstrap', 'status', '--db', db])
    assert status['has_genesis'] is True
    assert status['count'] == 1
