"""Executor adapter registry.

Adapters are dumb leaves: they return AUX fields for a result receipt; they do not
own authority and they never write directly to the ledger.
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from .errors import AdapterError
from .inference import run_inference_adapter
from .oauth import run_oauth_client_adapter

AdapterFn = Callable[[Mapping[str, Any], Mapping[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class AdapterResult:
    did: str
    status: str
    if_ok: str
    aux: dict[str, Any]


def receipt_adapter(source: Mapping[str, Any], queue_item: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "adapter_class": "internal.receipt",
        "source_hash": source.get("id", queue_item.get("source_hash", "")),
        "source_status": source.get("status", "missing"),
        "external_effect": False,
    }


def projection_adapter(source: Mapping[str, Any], queue_item: Mapping[str, Any]) -> dict[str, Any]:
    """Request a projection materialization without writing state from the adapter.

    The executor materializes ``projection_requests`` after governed dispatch.  This
    keeps the leaf dumb while making the first alive loop produce an actually visible
    projection instead of a receipt that merely claims one would exist.
    """
    request: dict[str, Any] = {
        "projection_spec": source.get("projection_spec", "lab_current_state"),
        "projection_class": source.get("projection_class", "stable"),
        "parent_projection_hashes": list(source.get("parent_projection_hashes", [])),
        "ladder_level": source.get("ladder_level", "L0"),
    }
    if source.get("projection_pin") is not None:
        request["pin"] = source.get("projection_pin")
    return {
        "adapter_class": "projection.rebuild",
        "projection_authoritative": False,
        "projection_rebuildable": True,
        "source_hash": source.get("id", queue_item.get("source_hash", "")),
        "external_effect": False,
        "projection_requests": [request],
    }


REGISTRY: dict[str, AdapterFn] = {
    "receipt": receipt_adapter,
    "projection": projection_adapter,
    "inference": run_inference_adapter,
    "oauth-client": run_oauth_client_adapter,
}

# Minimum danger tier each adapter carries, regardless of what a contract declares.
#
# The tier gates grants and passkey signoff, and it was pure declaration: a contract
# naming a powerful adapter could declare L0 and skip the dangerous-work controls
# entirely. That makes contract authorship strictly more powerful than any grant.
# The floor closes it — a contract may raise its own tier, never lower it below what
# the adapter's real reach demands. Every new adapter MUST declare a floor here.
ADAPTER_MIN_TIER: dict[str, str] = {
    "receipt": "L0",       # local ledger receipt only
    "projection": "L1",    # writes a disposable, rebuildable read model
    "inference": "L3",     # external integration, no irreversible effect
    "oauth-client": "L3",  # builds an external request; the effect lives at the edge
}
TIER_ORDER = ("L0", "L1", "L2", "L3", "L4", "L5")


def adapter_floor(adapter: str | None) -> str:
    """Floor tier for an adapter. Unknown adapters float to L0 — they cannot dispatch."""
    return ADAPTER_MIN_TIER.get(adapter or "", "L0")


def effective_danger_tier(declared: str, adapter: str | None) -> str:
    """The tier that actually governs: the stricter of what is declared and the floor."""
    floor = adapter_floor(adapter)
    if declared not in TIER_ORDER:
        return floor
    return declared if TIER_ORDER.index(declared) >= TIER_ORDER.index(floor) else floor


def run_adapter(name: str, source: Mapping[str, Any], queue_item: Mapping[str, Any]) -> dict[str, Any]:
    if name not in REGISTRY:
        raise AdapterError(f"unknown adapter: {name}")
    result = REGISTRY[name](source, queue_item)
    if not isinstance(result, dict):
        raise AdapterError(f"adapter {name} did not return a dict")
    return result
