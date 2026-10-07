"""Audit change log — database queries only (no business logic)."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.audit import AuditFieldChange
from app.models.users import User


def _apply_filters(query, table_name, record_id, user_id, field_name, date_from, date_to):
    if table_name:
        query = query.where(AuditFieldChange.table_name == table_name)
    if record_id:
        query = query.where(AuditFieldChange.record_id == record_id)
    if user_id is not None:
        query = query.where(AuditFieldChange.user_id == user_id)
    if field_name:
        query = query.where(AuditFieldChange.field_name == field_name)
    if date_from:
        query = query.where(AuditFieldChange.changed_at >= date_from)
    if date_to:
        query = query.where(AuditFieldChange.changed_at <= date_to)
    return query


def get_field_changes(
    session: Session,
    table_name: Optional[str] = None,
    record_id: Optional[str] = None,
    user_id: Optional[int] = None,
    field_name: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[tuple], int]:
    """Rows of (change, user full name, user role) newest first, and the total count."""
    filters = (table_name, record_id, user_id, field_name, date_from, date_to)
    query = _apply_filters(
        select(AuditFieldChange, User.full_name, User.role).outerjoin(User, User.id == AuditFieldChange.user_id),
        *filters,
    )
    total = session.exec(_apply_filters(select(func.count(AuditFieldChange.id)), *filters)).one()
    rows = session.exec(
        query.order_by(AuditFieldChange.changed_at.desc(), AuditFieldChange.id.desc()).offset(skip).limit(limit)
    ).all()
    return list(rows), int(total or 0)


def get_audited_tables(session: Session) -> List[str]:
    rows = session.exec(select(AuditFieldChange.table_name).distinct().order_by(AuditFieldChange.table_name)).all()
    return list(rows)
