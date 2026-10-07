"""Who is changing data right now, for the automatic change log.

The request middleware sets the actor (user id, IP, source "api"). Outside a request (startup seeds,
scheduler, scripts) the actor is "system". Services can attach a reason to the changes they make with
`audit_reason(...)`. ContextVars are copied into FastAPI's thread pool, so sync endpoints see them too.
"""
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Iterator, Optional

SOURCE_API = "api"
SOURCE_SYSTEM = "system"


@dataclass(frozen=True)
class AuditActor:
    user_id: Optional[int] = None
    ip: Optional[str] = None
    source: str = SOURCE_SYSTEM


_actor: ContextVar[AuditActor] = ContextVar("audit_actor", default=AuditActor())
_reason: ContextVar[Optional[str]] = ContextVar("audit_reason", default=None)


def set_actor(user_id: Optional[int], ip: Optional[str], source: str = SOURCE_API) -> Token:
    return _actor.set(AuditActor(user_id=user_id, ip=ip, source=source))


def reset_actor(token: Token) -> None:
    _actor.reset(token)


def current_actor() -> AuditActor:
    return _actor.get()


def current_reason() -> Optional[str]:
    return _reason.get()


@contextmanager
def audit_reason(reason: Optional[str]) -> Iterator[None]:
    """Attach a reason (e.g. cancellation motive) to every change flushed inside the block."""
    token = _reason.set((reason or "").strip() or None)
    try:
        yield
    finally:
        _reason.reset(token)
