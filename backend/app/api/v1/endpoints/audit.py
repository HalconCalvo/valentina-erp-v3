from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_active_user, get_session
from app.models.users import User
from app.schemas.audit_schema import (
    AuditFieldChangeListResponse,
    AuditFieldChangeRead,
    AuditLogListResponse,
    AuditLogRead,
)
from app.services import audit_service
from sqlmodel import Session

router = APIRouter()


@router.get("/logs", response_model=AuditLogListResponse)
def get_audit_logs(
    user_id: Optional[int] = Query(default=None),
    action: Optional[str] = Query(default=None),
    entity_type: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    rows, total = audit_service.list_audit_logs(
        session,
        current_user,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/changes", response_model=AuditFieldChangeListResponse)
def get_field_changes(
    table_name: Optional[str] = Query(default=None),
    record_id: Optional[str] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    field_name: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    rows, total = audit_service.list_field_changes(
        session, current_user, table_name=table_name, record_id=record_id, user_id=user_id,
        field_name=field_name, date_from=date_from, date_to=date_to, skip=skip, limit=limit,
    )
    return AuditFieldChangeListResponse(
        items=[AuditFieldChangeRead.model_validate(r) for r in rows], total=total, skip=skip, limit=limit
    )


@router.get("/history/{table_name}/{record_id}", response_model=list[AuditFieldChangeRead])
def get_record_history(
    table_name: str,
    record_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return audit_service.record_history(session, current_user, table_name, record_id)


@router.get("/tables", response_model=list[str])
def get_audited_tables(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return audit_service.audited_tables(session, current_user)
