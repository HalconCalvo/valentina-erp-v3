"""Role checks shared by endpoints and services (403 when the role is not allowed)."""
from typing import Iterable

from fastapi import HTTPException


def role_of(user) -> str:
    role = getattr(user, "role", None)
    return (role.value if hasattr(role, "value") else str(role or "")).strip().upper()


def require_roles(user, roles: Iterable[str], message: str = "No tienes permisos para esta operación.") -> None:
    if role_of(user) not in set(roles):
        raise HTTPException(status_code=403, detail=message)
