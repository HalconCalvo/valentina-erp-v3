"""D13: the seller (SALES) only sees sale prices, never costs or margins, in any screen or PDF.

get_current_user marks the request (scope state) when the user's role cannot see costs; this ASGI middleware
then blanks every cost or margin key (set to null) in the JSON responses of that request, whatever the endpoint.
"""
import json
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

COST_HIDDEN_ROLES = {"SALES"}
STATE_KEY = "hide_costs"

COST_FIELDS = frozenset({
    # quotations, sales orders, change orders
    "frozen_unit_cost", "cost_snapshot", "applied_margin_percent", "applied_tolerance_percent",
    # recipes and catalog
    "estimated_cost", "material_cost", "current_cost", "unit_cost", "base_cost", "total_cost", "line_total_cost",
    "expected_cost", "expected_unit_cost", "real_cost", "cost",
    # global config and analysis
    "target_profit_margin", "min_markup_percent", "cost_tolerance_percent", "markup_percent", "net_margin_percent",
    "margin_percent", "gross_profit", "profit",
})


def hides_costs(role: str) -> bool:
    return (role or "").strip().upper() in COST_HIDDEN_ROLES


def blank_costs(data: Any) -> Any:
    """Same structure with every cost or margin key set to None."""
    if isinstance(data, dict):
        return {key: (None if key in COST_FIELDS else blank_costs(value)) for key, value in data.items()}
    if isinstance(data, list):
        return [blank_costs(value) for value in data]
    return data


def _is_json(headers: list) -> bool:
    for key, value in headers:
        if key.lower() == b"content-type":
            return value.split(b";")[0].strip().lower() == b"application/json"
    return False


class CostVisibilityMiddleware:
    """Blanks costs and margins in JSON responses for roles that cannot see them (D13)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start: dict = {}
        chunks: list = []

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                if (scope.get("state") or {}).get(STATE_KEY) and _is_json(message.get("headers", [])):
                    start["message"] = message
                    return
                await send(message)
                return
            if message["type"] == "http.response.body" and start:
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return
                await _send_blanked(send, start["message"], b"".join(chunks))
                return
            await send(message)

        await self.app(scope, receive, send_wrapper)


async def _send_blanked(send: Send, start: Message, body: bytes) -> None:
    try:
        body = json.dumps(blank_costs(json.loads(body)), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except ValueError:
        pass
    headers = [(k, v) for k, v in start.get("headers", []) if k.lower() != b"content-length"]
    headers.append((b"content-length", str(len(body)).encode("latin-1")))
    await send({**start, "headers": headers})
    await send({"type": "http.response.body", "body": body})
