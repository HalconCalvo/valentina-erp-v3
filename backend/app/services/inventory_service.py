import math
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.inventory import InventoryTransaction
from app.models.material import Material
from app.repositories import inventory_repository as inventory_repo

IN_MOVEMENT_TYPES = {
    "PURCHASE_ENTRY",
    "ADJUSTMENT_IN",
    "TRANSFER_IN",
    "OPENING_BALANCE",
}
OUT_MOVEMENT_TYPES = {
    "PRODUCTION_EXIT",
    "WASTE",
    "ADJUSTMENT_OUT",
    "RETURN",
    "TRANSFER_OUT",
}
VALID_MOVEMENT_TYPES = IN_MOVEMENT_TYPES | OUT_MOVEMENT_TYPES
REQUIRES_REASON = {"WASTE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"}

KARDEX_VIEW_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE"}
ADJUST_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}


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


def register_movement(
    session: Session,
    material_id: int,
    movement_type: str,
    quantity: float,
    *,
    unit_cost: float | None = None,
    reason: str | None = None,
    reception_id: int | None = None,
    project_id: int | None = None,
    operator_badge: str | None = None,
    created_at: datetime | None = None,
    affect_stock: bool = True,
    commit: bool = True,
) -> dict:
    if movement_type not in VALID_MOVEMENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Tipo de movimiento inválido: {movement_type}")

    qty = float(quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a cero.")

    reason_text = (reason or "").strip()
    if movement_type in REQUIRES_REASON and not reason_text:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio para este tipo de movimiento.")

    if movement_type == "OPENING_BALANCE" and inventory_repo.has_opening_balance(session, material_id):
        raise HTTPException(status_code=400, detail="Ya existe un saldo inicial para este material.")

    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    signed_qty = _signed_quantity(movement_type, qty)
    current_stock = float(material.physical_stock or 0.0)
    new_stock = current_stock + signed_qty

    if affect_stock and new_stock < -0.0001:
        raise HTTPException(
            status_code=400,
            detail=f"El movimiento dejaría el stock en negativo (actual: {current_stock:.4f}).",
        )

    effective_unit_cost = float(unit_cost if unit_cost is not None else material.current_cost or 0.0)
    if movement_type == "PURCHASE_ENTRY":
        raw_cost = effective_unit_cost
        new_unit_cost = math.ceil(raw_cost * 100) / 100
        if new_unit_cost == 0.0 and raw_cost > 0:
            new_unit_cost = 0.01
        material.current_cost = new_unit_cost
        effective_unit_cost = new_unit_cost

    if affect_stock:
        material.physical_stock = new_stock
        session.add(material)

    movement = InventoryTransaction(
        reception_id=reception_id,
        material_id=material.id,
        quantity=signed_qty,
        unit_cost=effective_unit_cost,
        subtotal=round(abs(signed_qty) * effective_unit_cost, 2),
        transaction_type=movement_type,
        project_id=project_id,
        operator_badge=operator_badge,
        reason_code=reason_text or None,
        created_at=created_at or datetime.utcnow(),
    )
    session.add(movement)

    if commit:
        session.commit()
        session.refresh(material)
        session.refresh(movement)
    else:
        session.flush()

    return {
        "material_id": material.id,
        "movement_id": movement.id,
        "movement_type": movement_type,
        "quantity": signed_qty,
        "new_stock": float(material.physical_stock or 0.0),
        "unit_cost": effective_unit_cost,
    }


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


def register_manual_adjustment_to_count(
    session: Session,
    material_id: int,
    counted_quantity: float,
    notes: str,
    current_user,
) -> dict:
    _assert_roles(current_user, ADJUST_ROLES)
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    counted = float(counted_quantity or 0.0)
    difference = counted - float(material.physical_stock or 0.0)
    if difference == 0:
        return {"ok": True, "message": "Sin diferencia, stock no modificado"}

    movement_type = "ADJUSTMENT_IN" if difference > 0 else "ADJUSTMENT_OUT"
    result = register_movement(
        session,
        material_id,
        movement_type,
        abs(difference),
        reason=notes or "Inventario físico",
        operator_badge=getattr(current_user, "email", None),
    )
    return {
        "ok": True,
        "material_id": material_id,
        "movement_type": movement_type,
        "difference": difference,
        "new_stock": result["new_stock"],
    }


def register_physical_count(
    session: Session,
    material_id: int,
    counted_quantity: float,
    fecha_conteo: str,
    current_user,
    notes: str | None = None,
) -> dict:
    _assert_roles(current_user, ADJUST_ROLES)
    material = inventory_repo.get_material_by_id(session, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    counted = float(counted_quantity or 0.0)
    try:
        fecha_base = datetime.strptime(str(fecha_conteo)[:10], "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.") from exc

    fecha_fin_dia = fecha_base.replace(hour=23, minute=59, second=59, microsecond=999999)
    conteos_previos = session.exec(
        select(InventoryTransaction).where(
            InventoryTransaction.material_id == material_id,
            InventoryTransaction.transaction_type.in_(["PHYSICAL_COUNT", "AJUSTE_CONTEO_FISICO"]),
            InventoryTransaction.created_at == fecha_fin_dia,
        )
    ).all()

    for viejo in conteos_previos:
        inverse_type = "ADJUSTMENT_IN" if float(viejo.quantity or 0.0) < 0 else "ADJUSTMENT_OUT"
        register_movement(
            session,
            material_id,
            inverse_type,
            abs(float(viejo.quantity or 0.0)),
            reason="Reversión de conteo físico previo",
            operator_badge=getattr(current_user, "email", None),
            commit=False,
        )
        session.delete(viejo)

    session.flush()
    saldo_a_fecha = inventory_repo.calcular_saldo_a_fecha(session, material_id, fecha_fin_dia)
    diferencia = counted - saldo_a_fecha

    if diferencia == 0:
        session.commit()
        session.refresh(material)
        return {
            "ok": True,
            "message": "Sin diferencia, no se registró movimiento.",
            "material_id": material_id,
            "saldo_a_fecha": saldo_a_fecha,
            "counted_quantity": counted,
            "diferencia": 0.0,
            "nuevo_physical_stock": float(material.physical_stock or 0.0),
        }

    movement_type = "ADJUSTMENT_IN" if diferencia > 0 else "ADJUSTMENT_OUT"
    register_movement(
        session,
        material_id,
        movement_type,
        abs(diferencia),
        reason=notes or "CONTEO_FISICO",
        operator_badge=getattr(current_user, "email", None),
        created_at=fecha_fin_dia,
        commit=True,
    )
    session.refresh(material)

    return {
        "ok": True,
        "material_id": material_id,
        "saldo_a_fecha": saldo_a_fecha,
        "counted_quantity": counted,
        "diferencia": diferencia,
        "nuevo_physical_stock": float(material.physical_stock or 0.0),
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
    for row in rows:
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
                "saldo_acumulado": round(saldo, 4),
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
