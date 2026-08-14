"""Closed predicate vocabulary for process activation."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Callable

from .contracts import ProcessContract, SlotRule


CONTENT_HASH = re.compile(r"^[0-9a-f]{64}$")


def _result(
    rule: SlotRule,
    observed: Any,
    *,
    passed: bool,
    code: str,
    expected: Any,
) -> dict[str, Any]:
    return {
        "predicate": rule.predicate,
        "expected": expected,
        "observed": observed,
        "passed": passed,
        "code": code,
    }


def _present(value: Any) -> bool:
    return bool(str(value or "").strip())


def _values(rule: SlotRule) -> list[str]:
    return list(rule.values)


def _parse_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _authority_expected(context: dict[str, Any]) -> list[str]:
    contract: ProcessContract = context["contract"]
    return list(contract.allowed_who) or ["authenticated_authority"]


def _continuation_expected(rule: SlotRule, context: dict[str, Any]) -> list[str]:
    if rule.values:
        return _values(rule)
    contract: ProcessContract = context["contract"]
    slot = context["slot"]
    defaults = {
        "if_ok": contract.process_id,
        "if_doubt": contract.doubt_path,
        "if_not": "stop",
    }
    return [defaults[slot]]


def _eval_present(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    slot = context["slot"]
    passed = _present(value)
    return _result(
        rule,
        value,
        passed=passed,
        code="present" if passed else f"{slot}_missing",
        expected="non_empty",
    )


def _eval_authorized(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    expected = _authority_expected(context)
    allowed = context["contract"].allowed_who
    passed = _present(value) and (not allowed or str(value) in allowed)
    slot = context["slot"]
    code = "authorized" if passed else (
        "who_not_authorized" if slot == "who" else "confirmed_by_not_authorized"
    )
    return _result(rule, value, passed=passed, code=code, expected=expected)


def _eval_allowed(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    expected = _values(rule)
    passed = bool(expected) and str(value) in expected
    return _result(
        rule,
        value,
        passed=passed,
        code="did_admitted" if passed else "did_not_admitted",
        expected=expected,
    )


def _eval_canonical(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    passed = _present(value)
    return _result(
        rule,
        value,
        passed=passed,
        code="this_canonical" if passed else "this_not_canonical",
        expected="non_empty_canonical_reference",
    )


def _eval_hash(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    passed = bool(CONTENT_HASH.fullmatch(str(value or "")))
    slot = context["slot"]
    code = "content_hash" if passed else (
        "this_not_content_hash" if slot == "this" else "confirmation_evidence_invalid"
    )
    return _result(rule, value, passed=passed, code=code, expected="64_lower_hex")


def _eval_registered_at(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    passed = _parse_time(value) is not None
    return _result(
        rule,
        value,
        passed=passed,
        code="when_registered_at" if passed else "when_invalid",
        expected="timezone_aware_iso8601",
    )


def _eval_future(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    parsed = _parse_time(value)
    now = context.get("now") or datetime.now(timezone.utc)
    passed = parsed is not None and parsed > now
    return _result(
        rule,
        value,
        passed=passed,
        code="when_future" if passed else "when_not_future",
        expected=f"after:{now.isoformat()}",
    )


def _eval_compatible(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    expected = _continuation_expected(rule, context)
    passed = str(value) in expected
    slot = context["slot"]
    return _result(
        rule,
        value,
        passed=passed,
        code=f"{slot}_compatible" if passed else f"{slot}_incompatible",
        expected=expected,
    )


def _eval_initial(rule: SlotRule, value: Any, context: dict[str, Any]) -> dict[str, Any]:
    expected = _values(rule) or ["registered"]
    passed = str(value) in expected
    return _result(
        rule,
        value,
        passed=passed,
        code="status_initial" if passed else "status_initial_invalid",
        expected=expected,
    )


Predicate = Callable[[SlotRule, Any, dict[str, Any]], dict[str, Any]]
PREDICATES: dict[str, Predicate] = {
    "who.present": _eval_present,
    "who.authorized": _eval_authorized,
    "did.present": _eval_present,
    "did.allowed": _eval_allowed,
    "this.present": _eval_present,
    "this.canonical": _eval_canonical,
    "this.content_hash": _eval_hash,
    "when.registered_at": _eval_registered_at,
    "when.future": _eval_future,
    "confirmed_by.present": _eval_present,
    "confirmed_by.authority": _eval_authorized,
    "confirmed_by.evidence_hash": _eval_hash,
    "if_ok.compatible": _eval_compatible,
    "if_doubt.compatible": _eval_compatible,
    "if_not.compatible": _eval_compatible,
    "status.initial": _eval_initial,
}


def evaluate_slot(
    rule: SlotRule,
    value: Any,
    context: dict[str, Any],
) -> dict[str, Any]:
    predicate = PREDICATES.get(rule.predicate)
    if predicate is None:
        return _result(
            rule,
            value,
            passed=False,
            code="unknown_predicate",
            expected=rule.predicate,
        )
    return predicate(rule, value, context)
