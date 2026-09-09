"""Audit trail — business logic for immutable action logging."""
import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.models.audit import AuditLog
from app.models.users import User, UserRole

CANCEL = "CANCEL"
APPROVE = "APPROVE"
CREATE = "CREATE"
UPDATE = "UPDATE"
PAY = "PAY"
RELEASE = "RELEASE"
INVOICE = "INVOICE"
COLLECT = "COLLECT"
ADJUST = "ADJUST"

SALES_ORDER = "sales_order"
INSTALLMENT = "installment"
COMMISSION = "commission"
PURCHASE_ORDER = "purchase_order"
INVENTORY = "inventory"
CUSTOMER_PAYMENT = "customer_payment"
RETENTION = "retention"


def _user_role_str(user: Optional[User]) -> str:
    if not user or user.role is None:
        return ""
    if hasattr(user.role, "value"):
        return str(user.role.value).strip().upper()
    return str(user.role).strip().upper()


def _extract_ip(request: Optional[Any]) -> Optional[str]:
    if request is None:
        return None
    client = getattr(request, "client", None)
    return client.host if client else None


def log_action(
    session: Session,
    user: Optional[User],
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    entity_reference: Optional[str] = None,
    description: str = "",
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    request: Optional[Any] = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        user_name=(user.full_name or "") if user else "",
        user_role=_user_role_str(user),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_reference=entity_reference,
        description=description or "",
        old_values=json.dumps(old_values, default=str) if old_values is not None else None,
        new_values=json.dumps(new_values, default=str) if new_values is not None else None,
        ip_address=_extract_ip(request),
    )
    session.add(entry)
    session.flush()
    return entry


def _require_director(user: User) -> None:
    if _user_role_str(user) != UserRole.DIRECTOR.value:
        raise HTTPException(status_code=403, detail="Acceso restringido al Director.")


def _parse_filter_date(value: Optional[str], field: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Fecha inválida en {field}.") from exc


def list_audit_logs(
    session: Session,
    current_user: User,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[List[AuditLog], int]:
    _require_director(current_user)
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))

    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
        count_stmt = count_stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
        count_stmt = count_stmt.where(AuditLog.action == action.upper())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
    df = _parse_filter_date(date_from, "date_from")
    dt = _parse_filter_date(date_to, "date_to")
    if df:
        stmt = stmt.where(AuditLog.created_at >= df)
        count_stmt = count_stmt.where(AuditLog.created_at >= df)
    if dt:
        stmt = stmt.where(AuditLog.created_at <= dt)
        count_stmt = count_stmt.where(AuditLog.created_at <= dt)

    total = int(session.exec(count_stmt).one())
    rows = list(
        session.exec(
            stmt.order_by(AuditLog.created_at.desc()).offset(skip).limit(min(limit, 200))
        ).all()
    )
    return rows, total
