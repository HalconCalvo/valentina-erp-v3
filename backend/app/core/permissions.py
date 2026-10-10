"""Role checks shared by endpoints and services (403 when the role is not allowed)."""
from typing import Iterable

from fastapi import Depends, HTTPException

from app.core.deps import CurrentUser

# Role groups (CLAUDE.md §4; reviewed by Gabriel in DECISIONES_PENDIENTES D7)
FINANCE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}          # money: invoices, payments, bank, receivables
EXECUTE_PAYMENT_ROLES = {"DIRECTOR", "MANAGER"}            # money actually leaves (ADMIN requests, does not execute)
PURCHASING_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
REQUISITION_ROLES = PURCHASING_ROLES | {"PRODUCTION", "DESIGN"}
STOCK_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
SALES_ORDER_ROLES = {"DIRECTOR", "MANAGER"}                # cancel an OV (releases material)
PRODUCTION_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "PRODUCTION", "DESIGN"}
PLANNING_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "PRODUCTION", "DESIGN", "LOGISTICS"}
INSTALLATION_ROLES = {"DIRECTOR", "MANAGER", "LOGISTICS"}  # installed / signed feeds installer payroll
FIELD_ROLES = {"DIRECTOR", "MANAGER", "LOGISTICS", "PRODUCTION", "DESIGN"}
ANY_ROLE = {"DIRECTOR", "MANAGER", "ADMIN", "SALES", "DESIGN", "PRODUCTION", "WAREHOUSE", "LOGISTICS"}


def role_of(user) -> str:
    role = getattr(user, "role", None)
    return (role.value if hasattr(role, "value") else str(role or "")).strip().upper()


def require_roles(user, roles: Iterable[str], message: str = "No tienes permisos para esta operación.") -> None:
    if role_of(user) not in set(roles):
        raise HTTPException(status_code=403, detail=message)


def allow(roles: Iterable[str], message: str = "No tienes permisos para esta operación."):
    """Route dependency: requires a session and one of the roles. Use as `dependencies=[allow(FINANCE_ROLES)]`."""
    allowed = set(roles)

    def _check(current_user: CurrentUser) -> None:
        require_roles(current_user, allowed, message)

    return Depends(_check)
