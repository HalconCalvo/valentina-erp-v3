from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_active_user
from app.models.users import User, UserRole
from app.schemas.backup_schema import BackupRunRead
from app.services import backup_service

router = APIRouter()


@router.get("/backup/run", response_model=BackupRunRead)
def run_backup_manual(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    role = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    ).upper()
    if role != UserRole.DIRECTOR.value:
        raise HTTPException(status_code=403, detail="Solo DIRECTOR puede ejecutar backups.")
    return backup_service.run_backup()
