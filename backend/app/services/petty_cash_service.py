"""Petty cash movements are cancelled (reason, date, user), never deleted; the fund balance is reverted."""
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.audit_context import audit_reason
from app.core.permissions import require_roles
from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.schemas.petty_cash_schema import PettyCashMovementCancel

CANCEL_ROLES = {"DIRECTOR", "MANAGER"}


def assert_editable(movement: PettyCashMovement) -> None:
    if movement.is_cancelled:
        raise HTTPException(status_code=409, detail="El movimiento está cancelado; no se puede editar.")


def cancel_movement(session: Session, movement_id: int, data: PettyCashMovementCancel, user) -> PettyCashMovement:
    require_roles(user, CANCEL_ROLES, "Solo Dirección o Gerencia cancelan movimientos de caja chica.")
    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="El motivo de la cancelación es obligatorio.")
    movement = session.get(PettyCashMovement, movement_id)
    if not movement:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")
    assert_editable(movement)
    fund = session.exec(select(PettyCashFund)).first()
    with audit_reason(reason):
        if fund:
            sign = 1 if movement.movement_type == "EGRESO" else -1 if movement.movement_type == "REPOSICION" else 0
            fund.current_balance += sign * movement.amount
            fund.updated_at = datetime.utcnow()
            fund.updated_by_id = user.id
            session.add(fund)
        movement.is_cancelled = True
        movement.cancel_reason = reason
        movement.cancelled_at = datetime.utcnow()
        movement.cancelled_by_id = user.id
        session.add(movement)
        session.commit()
    session.refresh(movement)
    return movement
