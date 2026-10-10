import math
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.business_time import format_local_date
from app.models.inventory import InventoryTransaction
from app.models.material import Material
from app.repositories import inventory_repository as inventory_repo

IN_MOVEMENT_TYPES = {
    "PURCHASE_ENTRY",
    "ADJUSTMENT_IN",
    "TRANSFER_IN",
    "OPENING_BALANCE",
    "PRODUCTION_RETURN",
    "INVENTORY_DIFF_IN",
}
OUT_MOVEMENT_TYPES = {
    "PRODUCTION_EXIT",
    "WASTE",
    "ADJUSTMENT_OUT",
    "RETURN",
    "TRANSFER_OUT",
    "INVENTORY_DIFF_OUT",
    "EXPENSE_WRITE_OFF",  # stock of a material marked non-inventoriable, sent to expense
}
VALID_MOVEMENT_TYPES = IN_MOVEMENT_TYPES | OUT_MOVEMENT_TYPES
REQUIRES_REASON = {"WASTE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"}

KARDEX_VIEW_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
ADJUST_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
NEGATIVE_STOCK_TOLERANCE = 0.0001
FUTURE_TOLERANCE = timedelta(minutes=5)


def _resolve_role(user) -> str:
    role = user.role
    return (role.value if hasattr(role, "value") else str(role)).upper()


def _assert_roles(user, roles: set[str]) -> None:
    if _resolve_role(user) not in roles:
        raise HTTPException(status_code=403, detail="Sin permisos para esta operación.")


def _signed_quantity(movement_type: str, quantity: float) -> float:
    if movement_type in IN_MOVEMENT_TYPES:
        return abs(quantity)
    return -abs(quantity)


def usage_unit_cost(material: Material, purchase_unit_cost: float | None = None) -> float:
    """Cost per usage unit. Material.current_cost (and purchase costs) are per purchase unit."""
    cost = float(material.current_cost or 0.0) if purchase_unit_cost is None else float(purchase_unit_cost)
    factor = float(material.conversion_factor or 1.0) or 1.0
    return cost / factor


def check_movement_date(session: Session, effective_at: datetime) -> None:
    """Rejects future dates and dates inside a closed inventory period."""
    if effective_at > datetime.utcnow() + FUTURE_TOLERANCE:
        raise HTTPException(status_code=400, detail="La fecha del movimiento no puede ser futura.")
    locks = inventory_repo.get_active_locks(session)
    if locks and effective_at <= locks[0].locked_until:
        raise HTTPException(
            status_code=400,
            detail=f"Periodo de inventario cerrado al {format_local_date(locks[0].locked_until)}.",
        )


def _validate_movement(
    session: Session, material_id: int, movement_type: str, qty: float, reason_text: str, effective_at: datetime
) -> Material:
    if movement_type not in VALID_MOVEMENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Tipo de movimiento inválido: {movement_type}")
    if qty <= 0:
        raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a cero.")
    if movement_type in REQUIRES_REASON and not reason_text:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio para este tipo de movimiento.")
    check_movement_date(session, effective_at)
    if movement_type == "OPENING_BALANCE" and inventory_repo.has_opening_balance(session, material_id):
        raise HTTPException(status_code=400, detail="Ya existe un saldo inicial para este material.")
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    return material


def _apply_purchase_cost(material: Material, unit_cost: float | None) -> float:
    """Updates current_cost (per purchase unit, rounded up to the cent) and returns it."""
    raw_cost = float(unit_cost if unit_cost is not None else material.current_cost or 0.0)
    new_unit_cost = math.ceil(round(raw_cost * 100, 6)) / 100  # round() drops float noise: 34.45 stays 34.45
    if new_unit_cost == 0.0 and raw_cost > 0:
        new_unit_cost = 0.01
    material.current_cost = new_unit_cost
    return new_unit_cost


def _check_stock(material: Material, signed_qty: float, affect_stock: bool, allow_negative: bool) -> float:
    current_stock = float(material.physical_stock or 0.0)
    new_stock = current_stock + signed_qty
    if affect_stock and not allow_negative and new_stock < -NEGATIVE_STOCK_TOLERANCE:
        raise HTTPException(
            status_code=400,
            detail=f"El movimiento dejaría el stock en negativo (actual: {current_stock:.4f}).",
        )
    return new_stock


def _kardex_cost(material: Material, movement_type: str, unit_cost: float | None, usage_cost: float | None) -> float:
    if usage_cost is not None:
        return float(usage_cost)
    purchase_cost = _apply_purchase_cost(material, unit_cost) if movement_type == "PURCHASE_ENTRY" else unit_cost
    return usage_unit_cost(material, purchase_cost)


def _persist(session: Session, commit: bool, material: Material, movement: InventoryTransaction) -> None:
    session.add(movement)
    if commit:
        session.commit()
        session.refresh(material)
        session.refresh(movement)
    else:
        session.flush()


def register_movement(
    session: Session,
    material_id: int,
    movement_type: str,
    quantity: float,
    *,
    unit_cost: float | None = None,
    usage_cost: float | None = None,
    reason: str | None = None,
    reception_id: int | None = None,
    project_id: int | None = None,
    operator_badge: str | None = None,
    created_at: datetime | None = None,
    affect_stock: bool = True,
    commit: bool = True,
    allow_negative: bool = False,
    trace: dict | None = None,
) -> dict:
    """unit_cost is per purchase unit (like Material.current_cost); usage_cost is already per usage unit.
    The kardex stores cost per usage unit. trace: production_batch_id, instance_id, user_id, authorization_id."""
    reason_text = (reason or "").strip()
    effective_at = created_at or datetime.utcnow()
    material = _validate_movement(session, material_id, movement_type, float(quantity or 0.0), reason_text, effective_at)
    signed_qty = _signed_quantity(movement_type, float(quantity))
    new_stock = _check_stock(material, signed_qty, affect_stock, allow_negative)
    kardex_cost = _kardex_cost(material, movement_type, unit_cost, usage_cost)
    if affect_stock:
        material.physical_stock = new_stock
    session.add(material)
    movement = InventoryTransaction(
        reception_id=reception_id,
        material_id=material.id,
        quantity=signed_qty,
        unit_cost=kardex_cost,
        subtotal=round(abs(signed_qty) * kardex_cost, 2),
        transaction_type=movement_type,
        project_id=project_id,
        operator_badge=operator_badge,
        reason_code=reason_text or None,
        created_at=effective_at,
        recorded_at=datetime.utcnow(),
        **(trace or {}),
    )
    _persist(session, commit, material, movement)
    return {"material_id": material.id, "movement_id": movement.id, "movement_type": movement_type,
            "quantity": signed_qty, "new_stock": float(material.physical_stock or 0.0), "unit_cost": kardex_cost}


def register_manual_adjustment_by_delta(
    session: Session,
    material_id: int,
    delta: float,
    reason: str,
    current_user,
) -> dict:
    _assert_roles(current_user, ADJUST_ROLES)
    delta_f = float(delta or 0.0)
    if delta_f == 0:
        return {"ok": True, "message": "Sin diferencia, stock no modificado"}
    movement_type = "ADJUSTMENT_IN" if delta_f > 0 else "ADJUSTMENT_OUT"
    result = register_movement(
        session,
        material_id,
        movement_type,
        abs(delta_f),
        reason=reason or "Ajuste manual",
        operator_badge=getattr(current_user, "email", None),
    )
    return {
        "ok": True,
        "material_id": material_id,
        "movement_type": movement_type,
        "delta": delta_f,
        "new_stock": result["new_stock"],
    }


def get_material_kardex(
    session: Session,
    material_id: int,
    current_user,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> dict:
    _assert_roles(current_user, KARDEX_VIEW_ROLES)
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    rows = inventory_repo.get_kardex(session, material_id, date_from, date_to)
    saldo = 0.0
    entries = []
    for row, operator_name in rows:
        saldo += float(row.quantity or 0.0)
        entries.append(
            {
                "id": row.id,
                "material_id": row.material_id,
                "quantity": row.quantity,
                "unit_cost": row.unit_cost,
                "subtotal": row.subtotal,
                "transaction_type": row.transaction_type,
                "reason_code": row.reason_code,
                "project_id": row.project_id,
                "reception_id": row.reception_id,
                "created_at": row.created_at,
                "recorded_at": row.recorded_at,
                "saldo_acumulado": round(saldo, 4),
                "operator_name": operator_name,
            }
        )
    return {
        "material_id": material_id,
        "material_name": material.name,
        "material_sku": material.sku,
        "current_stock": float(material.physical_stock or 0.0),
        "entries": entries,
    }


def list_low_stock_materials(session: Session, current_user) -> list[dict]:
    _assert_roles(current_user, KARDEX_VIEW_ROLES)
    materials = inventory_repo.get_low_stock_materials(session)
    return [
        {
            "id": m.id,
            "sku": m.sku,
            "name": m.name,
            "physical_stock": float(m.physical_stock or 0.0),
            "min_stock": float(m.min_stock or 0.0),
            "max_stock": float(m.max_stock or 0.0),
            "current_cost": float(m.current_cost or 0.0),
        }
        for m in materials
    ]


def get_inventory_valuation(session: Session, current_user) -> dict:
    _assert_roles(current_user, KARDEX_VIEW_ROLES)
    total = inventory_repo.get_inventory_valuation(session)
    return {"total_valuation": round(total, 2)}


def seed_opening_balance_entries(session: Session, current_user) -> dict:
    _assert_roles(current_user, ADJUST_ROLES)
    materials = session.exec(select(Material)).all()
    sembrados = 0
    saltados_existente = 0
    saltados_stock_cero = 0

    for material in materials:
        if inventory_repo.has_opening_balance(session, material.id):
            saltados_existente += 1
            continue
        stock_actual = float(material.physical_stock or 0.0)
        if stock_actual <= 0:
            saltados_stock_cero += 1
            continue
        register_movement(
            session,
            material.id,
            "OPENING_BALANCE",
            stock_actual,
            unit_cost=float(material.current_cost or 0.0),
            reason="SALDO_APERTURA",
            affect_stock=False,
            commit=False,
        )
        sembrados += 1

    session.commit()
    return {
        "sembrados": sembrados,
        "saltados_existente": saltados_existente,
        "saltados_stock_cero": saltados_stock_cero,
        "total_materiales": len(materials),
    }
