"""Role checks shared by endpoints and services (403 when the role is not allowed)."""
from typing import Iterable

from fastapi import Depends, HTTPException
from sqlmodel import Session, select

from app.core.deps import CurrentUser, SessionDep
from app.models.foundations import GlobalConfig

# Role groups (CLAUDE.md §4; reviewed by Gabriel in DECISIONES_PENDIENTES D7)
FINANCE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}          # money: invoices, payments, bank, receivables
SALES_READ_ROLES = FINANCE_ROLES | {"SALES"}              # quotations/OVs/receivables; SALES scoped to its own
# Money actually leaves: DIRECTOR; MANAGER only with GlobalConfig.manager_can_execute_payments (D7). ADMIN requests.
EXECUTE_PAYMENT_ROLES = {"DIRECTOR", "MANAGER"}
PURCHASING_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
REQUISITION_ROLES = PURCHASING_ROLES | {"PRODUCTION", "DESIGN"}
STOCK_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
SALES_ORDER_ROLES = {"DIRECTOR", "MANAGER"}                # cancel an OV (releases material)
PRODUCTION_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "PRODUCTION", "DESIGN"}
PLANNING_ROLES = {"DIRECTOR", "DESIGN"}                    # plan and reschedule (D7)
INSTANCE_LIFECYCLE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "PRODUCTION", "DESIGN", "LOGISTICS"}  # close, warranty
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


def can_execute_payments(session: Session, user) -> bool:
    role = role_of(user)
    if role == "DIRECTOR":
        return True
    if role != "MANAGER":
        return False
    config = session.exec(select(GlobalConfig)).first()
    return bool(config and config.manager_can_execute_payments)


def allow_payment_execution():
    """Route dependency for anything that makes money leave (pay, transfer, mark paid)."""
    def _check(current_user: CurrentUser, session: SessionDep) -> None:
        if not can_execute_payments(session, current_user):
            raise HTTPException(status_code=403, detail="Solo Dirección ejecuta pagos (Gerencia, si Dirección lo habilita).")

    return Depends(_check)
