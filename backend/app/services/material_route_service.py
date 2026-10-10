"""Production route of a material, which decides whether it holds stock (only MATERIAL does).

Leaving MATERIAL with stock sends that stock to expense in one documented movement (EXPENSE_WRITE_OFF,
"Enviado a gasto"); that change is the approval, so it is reserved to DIRECTOR / MANAGER. The same write-off
is available for materials that are already not MATERIAL but still show stock. If the material is in an open
physical inventory session its line leaves the session (no count, no difference) and the write-off is dated
at the session cut, so the period closes without that stock.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.material import Material, ProductionRoute, holds_stock
from app.repositories import inventory_repository as inventory_repo
from app.repositories import production_inventory_repository as prod_inv_repo
from app.schemas.inventory_schema import MaterialRouteUpdate, StockWriteOffCreate
from app.services import inventory_service, production_inventory_service

ROUTE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
WRITE_OFF_ROLES = {"DIRECTOR", "MANAGER"}
QTY_TOLERANCE = 0.0001


def _role(user) -> str:
    role = getattr(user, "role", None)
    return (role.value if hasattr(role, "value") else str(role or "")).upper()


def _require(user, roles: set, message: str) -> None:
    if _role(user) not in roles:
        raise HTTPException(status_code=403, detail=message)


def _post(session: Session, material: Material, quantity: float, effective_at: datetime, reason: str, user) -> None:
    """Brings `quantity` of stock to zero: out to expense if positive, back in if negative (oversold)."""
    if abs(quantity) <= QTY_TOLERANCE:
        return
    movement = "EXPENSE_WRITE_OFF" if quantity > 0 else "ADJUSTMENT_IN"
    inventory_service.register_movement(
        session, material.id, movement, abs(quantity), usage_cost=inventory_service.usage_unit_cost(material),
        reason=reason, created_at=effective_at, commit=False, allow_negative=True, trace={"user_id": user.id},
    )


def _write_off(session: Session, material: Material, cut_at: Optional[datetime], reason: str, user) -> None:
    """Stock at the open session cut is written off at the cut; anything after it, today."""
    if cut_at is not None:
        at_cut = inventory_repo.get_balances_at(session, cut_at).get(material.id, 0.0)
        _post(session, material, at_cut, cut_at, reason, user)
        session.flush()
    _post(session, material, float(material.physical_stock or 0.0), datetime.utcnow(), reason, user)


def _exclude_from_open_sessions(session: Session, material: Material, reason: str, user) -> Optional[datetime]:
    """Takes the material out of open sessions; returns the cut of the session it was in (if any)."""
    cut_at = None
    for item in inventory_repo.get_open_audit_items_for_material(session, material.id):
        item.excluded_at = datetime.utcnow()
        item.excluded_reason = reason
        item.excluded_by_user_id = user.id
        session.add(item)
        audit = inventory_repo.get_audit_by_id(session, item.audit_id)
        cut_at = cut_at or (audit.cut_at if audit and audit.status != "REABIERTA" else None)
    return cut_at


def _send_stock_to_expense(session: Session, material: Material, reason: str, user) -> None:
    if abs(float(material.physical_stock or 0.0)) > QTY_TOLERANCE:
        _require(user, WRITE_OFF_ROLES, "El material tiene existencia: solo Dirección o Gerencia la mandan a gasto.")
    cut_at = _exclude_from_open_sessions(session, material, reason, user)
    active = [r for r in prod_inv_repo.get_reservations(session, ["ACTIVA"]) if r.material_id == material.id]
    production_inventory_service.release_reservations(session, active, user, reason)
    _write_off(session, material, cut_at, reason, user)


def _clean_reason(reason: str) -> str:
    text = (reason or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio.")
    return text


def _get_material(session: Session, material_id: int) -> Material:
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    return material


def change_route(session: Session, material_id: int, data: MaterialRouteUpdate, user) -> Material:
    """Leaving MATERIAL with stock sends it to expense; any other change just records the reason."""
    _require(user, ROUTE_ROLES, "Solo Dirección, Gerencia o Administración cambian la ruta de un material.")
    reason = _clean_reason(data.reason)
    material = _get_material(session, material_id)
    try:
        new_route = ProductionRoute(str(data.production_route).upper())
    except ValueError:
        raise HTTPException(status_code=422, detail="Ruta de producción inválida.") from None
    if new_route == ProductionRoute(material.production_route):
        return material
    with audit_reason(reason):
        if holds_stock(material) and new_route != ProductionRoute.MATERIAL:
            _send_stock_to_expense(session, material, reason, user)
        material.production_route = new_route
        session.add(material)
        session.commit()
    session.refresh(material)
    return material


def write_off_stock(session: Session, material_id: int, data: StockWriteOffCreate, user) -> Material:
    """Stock left on a material that does not hold stock (not MATERIAL) goes to expense."""
    _require(user, WRITE_OFF_ROLES, "Solo Dirección o Gerencia mandan existencia a gasto.")
    reason = _clean_reason(data.reason)
    material = _get_material(session, material_id)
    if holds_stock(material):
        raise HTTPException(status_code=409, detail="El material es de ruta MATERIAL: su existencia se cuenta. "
                            "Cambia primero la ruta si no debe llevar existencia.")
    if (abs(float(material.physical_stock or 0.0)) <= QTY_TOLERANCE
            and not inventory_repo.get_open_audit_items_for_material(session, material.id)):
        return material
    with audit_reason(reason):
        _send_stock_to_expense(session, material, reason, user)
        session.add(material)
        session.commit()
    session.refresh(material)
    return material
