"""The HTTP surface an interface consumes.

Routing is tested through :func:`lab.api.dispatch` rather than a live socket: the
handler is a thin JSON wrapper, and the contract that matters is what each route
returns.
"""
from __future__ import annotations

import pytest

from lab.api import dispatch
from lab.messages import CATALOG
from lab.runtime import ensure_runtime
from lab.store import connect


@pytest.fixture()
def db(tmp_path):
    connection = connect(tmp_path / "api.sqlite")
    ensure_runtime(connection)
    return connection


def call(db, method, path, body=None, query=None, read_only=False):
    return dispatch(method, path, query or {}, body or {}, db=db, read_only=read_only)


COMPLETE = {
    "who": "dan", "did": "build_projection", "this": "lab", "confirmed_by": "dan",
    "if_ok": "projection-build.v1", "if_doubt": "attention-raise.v1", "if_not": "stop",
    "status": "registered", "projection_spec": "estado",
}
UNMATCHED = {
    "who": "dan", "did": "auditar", "this": "balanco-q3", "confirmed_by": "dan",
    "if_ok": "nao-existe-esse-tipo.v1", "if_doubt": "attention-raise.v1", "if_not": "stop",
    "status": "registered",
}


# --------------------------------------------------------------- registering is free

def test_registering_a_complete_act_registers_and_activates(db):
    status, body = call(db, "POST", "/api/register", COMPLETE)
    assert status == 200
    assert body["registered"] is True
    assert body["activated"] is True
    assert body["process_id"] == "projection-build.v1"
    assert len(body["fingerprint"]) == 8


def test_an_act_that_cannot_move_is_still_registered(db):
    """The whole doctrine in one assertion: there is no admission decision."""
    status, body = call(db, "POST", "/api/register", UNMATCHED)
    assert status == 200
    assert body["registered"] is True
    assert body["activated"] is False
    assert body["waiting"]["message"]
    assert body["waiting"]["action"]


def test_an_act_that_cannot_move_leaves_a_durable_pendency(db):
    """Registered but invisible would make "nothing is lost" true only of the ledger."""
    call(db, "POST", "/api/register", UNMATCHED)
    status, body = call(db, "GET", "/api/pendencies")
    assert status == 200
    assert body["count"] >= 1
    assert all(item["message"] for item in body["pendencies"])


def test_reported_verdict_matches_the_doubt_the_selector_writes(db):
    _, registered = call(db, "POST", "/api/register", UNMATCHED)
    _, pending = call(db, "GET", "/api/pendencies")
    codes = {item["code"] for item in pending["pendencies"]}
    assert registered["waiting"]["code"] in codes


def test_register_requires_an_author(db):
    status, body = call(db, "POST", "/api/register", {"did": "x", "this": "y"})
    assert status == 400
    assert "who" in body["error"]


def test_register_cannot_forge_identity_fields(db):
    """`id` and `hashes` are computed from content; a caller cannot assert them."""
    status, body = call(db, "POST", "/api/register", {**COMPLETE, "id": "0" * 64, "hashes": {"x": 1}})
    assert status == 200
    assert body["id"] != "0" * 64


# ------------------------------------------------------------------------ read paths

def test_health_reports_the_shape_of_the_runtime(db):
    status, body = call(db, "GET", "/api/health")
    assert status == 200
    assert body["ok"] is True
    assert body["doubt_reasons"] == len(CATALOG)


def test_vocabulary_serves_every_message(db):
    status, body = call(db, "GET", "/api/vocabulary")
    assert status == 200
    assert body["count"] == len(CATALOG)
    assert {entry["code"] for entry in body["reasons"]} == set(CATALOG)


def test_process_types_carry_what_a_form_needs(db):
    status, body = call(db, "GET", "/api/process-types")
    assert status == 200
    types = {entry["process_id"]: entry for entry in body["types"]}
    assert "projection-build.v1" in types
    entry = types["projection-build.v1"]
    assert entry["runnable"] is True
    assert entry["needs_approval"] is False
    assert "requires" in entry and "accepts" in entry


def test_process_types_flag_what_needs_approval(db):
    _, body = call(db, "GET", "/api/process-types")
    dangerous = [entry for entry in body["types"] if entry["needs_approval"]]
    assert dangerous, "the catalog ships L4/L5 types"
    assert all(entry["danger_tier"] in {"L4", "L5"} for entry in dangerous)
    assert all(entry["irreversible"] == (entry["danger_tier"] == "L5") for entry in dangerous)


def test_now_splits_by_who_can_act(db):
    call(db, "POST", "/api/register", UNMATCHED)
    call(db, "POST", "/api/register", COMPLETE)
    status, body = call(db, "GET", "/api/now")
    assert status == 200
    assert set(body) == {"needs_you", "needs_operator", "moving", "closed_today"}


def test_case_renders_a_timeline(db):
    _, registered = call(db, "POST", "/api/register", COMPLETE)
    status, body = call(db, "GET", f"/api/cases/{registered['id']}")
    assert status == 200
    assert body["valid"] is True
    assert body["timeline"][0]["label"] == "Registrado"
    assert body["fields"]["projection_spec"] == "estado"


def test_case_hides_nothing_and_invents_nothing(db):
    _, registered = call(db, "POST", "/api/register", COMPLETE)
    _, body = call(db, "GET", f"/api/cases/{registered['id']}")
    assert body["slots"]["who"] == "dan"
    assert "id" not in body["fields"]
    assert "hashes" not in body["fields"]


def test_unknown_case_is_a_404(db):
    status, _ = call(db, "GET", f"/api/cases/{'a' * 64}")
    assert status == 404


def test_case_route_rejects_a_non_hash(db):
    status, _ = call(db, "GET", "/api/cases/not-a-hash")
    assert status == 404


def test_projections_are_labelled_as_not_the_source(db):
    status, body = call(db, "GET", "/api/projections")
    assert status == 200
    assert "não são a fonte" in body["note"].lower()


def test_grants_list_is_empty_but_shaped(db):
    status, body = call(db, "GET", "/api/grants")
    assert status == 200
    assert body["grants"] == []


# --------------------------------------------------------------------- routing rules

def test_read_only_mode_refuses_writes(db):
    status, body = call(db, "POST", "/api/register", COMPLETE, read_only=True)
    assert status == 403
    assert body["code"] == "read_only"


def test_read_only_mode_still_serves_reads(db):
    status, _ = call(db, "GET", "/api/health", read_only=True)
    assert status == 200


def test_unknown_route_is_404(db):
    status, body = call(db, "GET", "/api/nope")
    assert status == 404
    assert body["code"] == "no_route"


def test_wrong_method_on_a_real_route_is_405(db):
    status, body = call(db, "POST", "/api/health")
    assert status == 405
    assert body["code"] == "method_not_allowed"


def test_limit_must_be_an_integer(db):
    status, body = call(db, "GET", "/api/pendencies", query={"limit": ["banana"]})
    assert status == 400
    assert body["code"] == "bad_request"


def test_limit_is_clamped(db):
    status, _ = call(db, "GET", "/api/pendencies", query={"limit": ["100000"]})
    assert status == 200


def test_grant_creation_requires_its_parties(db):
    status, body = call(db, "POST", "/api/grants", {"process": "worker-run.v1"})
    assert status == 400
    assert "granted_by" in body["error"]


def test_advance_reports_an_empty_queue_honestly(db):
    status, body = call(db, "POST", "/api/advance", {})
    assert status == 200
    assert body["ran"] is False
