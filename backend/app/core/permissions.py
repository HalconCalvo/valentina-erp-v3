"""Role checks shared by endpoints and services (403 when the role is not allowed)."""
from typing import Iterable

from fastapi import Depends, HTTPException
from sqlmodel import Session

from app.core.deps import CurrentUser, SessionDep

# Role groups (CLAUDE.md §4; reviewed by Gabriel in DECISIONES_PENDIENTES D7)
FINANCE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}          # money: invoices, payments, bank, receivables
SALES_READ_ROLES = FINANCE_ROLES | {"SALES"}              # quotations/OVs/receivables; SALES scoped to its own
# Money actually leaves: DIRECTOR only. D41 (Gabriel 17:04) removed MANAGER even with the D7 switch on, so
# GlobalConfig.manager_can_execute_payments no longer opens anything. ADMIN requests.
EXECUTE_PAYMENT_ROLES = {"DIRECTOR"}
# D41 (Gabriel 16/10): Gerencia (MANAGER) does not see or operate Bancos, does not register customer collections and
# does not register supplier payments; Bancos are run by Dirección (Alejandrina). Other roles keep what they had.
BANK_ROLES = FINANCE_ROLES - {"MANAGER"}
BANK_DENIED = "Bancos, cobros y pagos a proveedores los registra Dirección; Gerencia no los opera (D41)."
# D41: petty cash is run by Administración (registers) and Dirección; Gerencia only sees it.
PETTY_CASH_ROLES = BANK_ROLES
PETTY_CASH_DENIED = "Caja chica la operan Administración y Dirección; Gerencia solo la consulta (D41)."
PAYMENT_DENIED = "Solo Dirección ejecuta pagos; Gerencia no paga (D41)."
PURCHASING_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
REQUISITION_ROLES = PURCHASING_ROLES | {"PRODUCTION", "DESIGN"}
STOCK_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
SALES_ORDER_ROLES = {"DIRECTOR", "MANAGER"}                # cancel an OV (releases material)
BALANCE_FIX_ROLES = {"DIRECTOR", "MANAGER"}                # sanitation: recalculate invoice states and OV balances
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


def allow_banks():
    """D41 route dependency: banks, collections and supplier payments (never MANAGER)."""
    return allow(BANK_ROLES, BANK_DENIED)


def can_execute_payments(session: Session, user) -> bool:
    """Only DIRECTOR pays (D41); the session stays in the signature for the callers."""
    return role_of(user) in EXECUTE_PAYMENT_ROLES


def allow_payment_execution():
    """Route dependency for anything that makes money leave (pay, transfer, mark paid)."""
    def _check(current_user: CurrentUser, session: SessionDep) -> None:
        if not can_execute_payments(session, current_user):
            raise HTTPException(status_code=403, detail=PAYMENT_DENIED)

    return Depends(_check)
