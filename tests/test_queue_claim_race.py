"""A lost claim race must return nothing, never a second dispatch.

``claim`` guards its UPDATE with ``AND status = 'queued'``, which is the lock. It
did not check whether the UPDATE actually landed, so a worker that lost the race
still received the row and would dispatch work another worker already owned.
"""
from __future__ import annotations

from lab.runtime import claim, ensure_runtime, queue_add
from lab.store import append, connect


def _queued(db):
    receipt = append(db, {
        "who": "dan", "did": "note", "this": "thing", "when": "2026-08-12T00:00:00Z",
        "confirmed_by": "dan", "if_ok": "memory-register.v1",
        "if_doubt": "attention-raise.v1", "if_not": "stop", "status": "registered",
    })
    return queue_add(db, receipt["id"], "memory-register.v1", "receipt")


def test_claim_returns_the_item_when_it_wins():
    db = connect(":memory:")
    ensure_runtime(db)
    item = _queued(db)
    claimed = claim(db, "worker-a")
    assert claimed is not None
    assert claimed["queue_id"] == item["queue_id"]
    assert claimed["status"] == "claimed"
    assert claimed["claimed_by"] == "worker-a"


def test_second_claim_finds_nothing_left():
    db = connect(":memory:")
    ensure_runtime(db)
    _queued(db)
    assert claim(db, "worker-a") is not None
    assert claim(db, "worker-b") is None


class _LosesTheRace:
    """Connection proxy that lets another worker take the row between SELECT and UPDATE."""

    SELECT_QUEUED = "SELECT * FROM runtime_queue WHERE status = 'queued'"

    def __init__(self, db, queue_id):
        self._db = db
        self._queue_id = queue_id
        self._stolen = False

    def execute(self, sql, *args, **kwargs):
        if sql.strip().startswith(self.SELECT_QUEUED) and not self._stolen:
            self._stolen = True
            result = self._db.execute(sql, *args, **kwargs)
            self._db.execute(
                "UPDATE runtime_queue SET status = 'claimed', claimed_by = 'other' WHERE queue_id = ?",
                (self._queue_id,),
            )
            return result
        return self._db.execute(sql, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._db, name)


def test_claim_returns_none_when_another_worker_took_the_row_first():
    """The regression: losing the race used to hand the row over anyway."""
    db = connect(":memory:")
    ensure_runtime(db)
    item = _queued(db)

    assert claim(_LosesTheRace(db, item["queue_id"]), "loser") is None
    assert db.execute(
        "SELECT claimed_by FROM runtime_queue WHERE queue_id = ?", (item["queue_id"],)
    ).fetchone()["claimed_by"] == "other"


def test_claim_returns_none_on_an_empty_queue():
    db = connect(":memory:")
    ensure_runtime(db)
    assert claim(db, "worker") is None
