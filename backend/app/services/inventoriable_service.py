"""Inventoriable yes/no per material.

Non-inventoriable materials (consumables, services) are not counted, never hold stock and go to expense when
received. Marking one "no" while it has stock sends that stock to expense in one documented movement
(EXPENSE_WRITE_OFF, "Enviado a gasto"); that change is the approval, so it is reserved to DIRECTOR / MANAGER.
If the material is in an open physical inventory session its line leaves the session (no count, no difference)
and the write-off is dated at the session cut, so the period closes without that stock.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.material import Material
from app.repositories import inventory_repository as inventory_repo
from app.repositories import production_inventory_repository as prod_inv_repo
from app.schemas.inventory_schema import InventoriableUpdate
from app.services import inventory_service, production_inventory_service

FLAG_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
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


def _mark_not_inventoriable(session: Session, material: Material, reason: str, user) -> None:
    if abs(float(material.physical_stock or 0.0)) > QTY_TOLERANCE:
        _require(user, WRITE_OFF_ROLES, "El material tiene existencia: solo Dirección o Gerencia lo mandan a gasto.")
    cut_at = _exclude_from_open_sessions(session, material, reason, user)
    active = [r for r in prod_inv_repo.get_reservations(session, ["ACTIVA"]) if r.material_id == material.id]
    production_inventory_service.release_reservations(session, active, user, reason)
    _write_off(session, material, cut_at, reason, user)
    material.is_inventoriable = False


def _mark_inventoriable(session: Session, material: Material, user) -> None:
    """Back to inventoriable: open session lines come back to be counted; stock starts from zero."""
    for item in inventory_repo.get_excluded_open_audit_items(session, material.id):
        item.excluded_at, item.excluded_reason, item.excluded_by_user_id = None, None, None
        session.add(item)
    material.is_inventoriable = True


def set_inventoriable(session: Session, material_id: int, data: InventoriableUpdate, user) -> Material:
    _require(user, FLAG_ROLES, "Solo Dirección, Gerencia o Administración cambian si un material es inventariable.")
    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio.")
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    if bool(material.is_inventoriable) == data.is_inventoriable:
        return material
    with audit_reason(reason):
        if data.is_inventoriable:
            _mark_inventoriable(session, material, user)
        else:
            _mark_not_inventoriable(session, material, reason, user)
        session.add(material)
        session.commit()
    session.refresh(material)
    return material
