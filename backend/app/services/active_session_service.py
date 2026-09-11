"""Sesión única: una fila activa por usuario, liberada por logout o 5 min sin heartbeat."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.active_session import ActiveSession
from app.models.users import User

HEARTBEAT_TTL_MINUTES = 5
SESSION_ACTIVE_MESSAGE = (
    "Este usuario ya tiene una sesión activa. "
    "Cierra la sesión en el otro dispositivo antes de continuar."
)


def _cutoff() -> datetime:
    return datetime.utcnow() - timedelta(minutes=HEARTBEAT_TTL_MINUTES)


def _get_row(session: Session, user_id: int) -> Optional[ActiveSession]:
    return session.exec(
        select(ActiveSession).where(ActiveSession.user_id == user_id)
    ).first()


def _is_service_account(session: Session, user_id: int) -> bool:
    user = session.get(User, user_id)
    return bool(user and user.is_service_account)


def is_session_alive(row: Optional[ActiveSession]) -> bool:
    if not row:
        return False
    return row.last_heartbeat > _cutoff()


def assert_login_allowed(session: Session, user_id: int) -> None:
    if _is_service_account(session, user_id):
        return
    row = _get_row(session, user_id)
    if is_session_alive(row):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=SESSION_ACTIVE_MESSAGE,
        )


def upsert_active_session(
    session: Session,
    user_id: int,
    ip_address: Optional[str],
    user_agent: Optional[str],
) -> str:
    if _is_service_account(session, user_id):
        return ""
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    row = _get_row(session, user_id)
    if row:
        row.session_token = token
        row.ip_address = ip_address
        row.user_agent = user_agent
        row.last_heartbeat = now
        session.add(row)
    else:
        session.add(
            ActiveSession(
                user_id=user_id,
                session_token=token,
                ip_address=ip_address,
                user_agent=user_agent,
                created_at=now,
                last_heartbeat=now,
            )
        )
    session.commit()
    return token


def clear_active_session(session: Session, user_id: int) -> None:
    row = _get_row(session, user_id)
    if row:
        session.delete(row)
        session.commit()


def touch_heartbeat(session: Session, user_id: int) -> None:
    row = _get_row(session, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Sesión activa no encontrada")
    row.last_heartbeat = datetime.utcnow()
    session.add(row)
    session.commit()
