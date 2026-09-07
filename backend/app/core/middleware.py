"""HTTP request logging middleware."""
import time

import structlog
from jose import JWTError, jwt
from structlog.contextvars import bind_contextvars, clear_contextvars
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

logger = structlog.get_logger("app.request")

_SKIP_PATHS = frozenset({"/", "/health"})


def _header(scope: Scope, name: str) -> str | None:
    target = name.lower().encode("latin-1")
    for key, value in scope.get("headers", []):
        if key.lower() == target:
            return value.decode("latin-1")
    return None


def _extract_user_id(scope: Scope) -> int | None:
    authorization = _header(scope, "authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    user_id = payload.get("user_id")
    if user_id is not None:
        try:
            return int(user_id)
        except (TypeError, ValueError):
            return None
    return None


class RequestLoggingMiddleware:
    """Lightweight ASGI middleware — no thread pool, minimal overhead."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in _SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = 500
        user_id = _extract_user_id(scope)
        method = scope.get("method", "")

        bind_contextvars(user_id=user_id, path=path)

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error(
                "request_failed",
                method=method,
                path=path,
                status_code=status_code,
                duration_ms=duration_ms,
                user_id=user_id,
            )
            raise
        else:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            event = {
                "method": method,
                "path": path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "user_id": user_id,
            }
            if status_code >= 500:
                logger.error("request_completed", **event)
            elif status_code >= 400:
                logger.warning("request_completed", **event)
            else:
                logger.info("request_completed", **event)
        finally:
            clear_contextvars()


def add_request_logging_middleware(app) -> None:
    app.add_middleware(RequestLoggingMiddleware)
