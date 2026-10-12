from typing import Any

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.schemas.field_schema import (
    FieldLaneInstalledRead,
    FieldMyAssignmentsRead,
    FieldSyncPayload,
    FieldSyncRead,
)
from app.services import field_service

router = APIRouter()


@router.get("/my-assignments", response_model=FieldMyAssignmentsRead)
def my_assignments(session: SessionDep, current_user: CurrentUser) -> Any:
    return field_service.get_my_assignments(session, current_user)


@router.post("/instances/{instance_id}/sync", response_model=FieldSyncRead)
def sync_instance(
    instance_id: int,
    payload: FieldSyncPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    return field_service.sync_instance(session, current_user, instance_id, payload)


@router.post("/assignments/{assignment_id}/installed", response_model=FieldLaneInstalledRead)
def mark_lane_installed(assignment_id: int, session: SessionDep, current_user: CurrentUser) -> Any:
    return field_service.mark_lane_installed(session, current_user, assignment_id)
