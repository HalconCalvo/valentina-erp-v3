"""Recipe discharge from the warehouse when a production batch enters production.

- PRE -> POST batch transition: consumes the batch's ACTIVE reservations (PRODUCTION_EXIT).
  Missing stock blocks with a detailed list unless DIRECTOR/MANAGER authorizes with a reason.
- POST -> PRE, removing an instance from a batch in production, or cancelling an OV with discharged
  material: reversal by DIRECTOR/MANAGER with reason and disposition (back to stock or waste).
- Truck load moves the instance's consumed reservations to cost of sales (no stock movement).
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core import material_groups
from app.models.inventory import InventoryReservation, ProductionStockAuthorization
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import InstanceStatus, SalesOrderItemInstance
from app.repositories import production_inventory_repository as prod_inv_repo
from app.schemas.production_inventory_schema import BatchStatusUpdate, InstanceRemovalCreate, ReversalCreate
from app.services import inventory_service

PRE_PRODUCTION = {ProductionBatchStatus.PLANNED, ProductionBatchStatus.DRAFT, ProductionBatchStatus.ON_HOLD}
POST_PRODUCTION = {
    ProductionBatchStatus.IN_PRODUCTION,
    ProductionBatchStatus.PACKING,
    ProductionBatchStatus.READY_TO_INSTALL,
    ProductionBatchStatus.FINISHED,
}
LOADED_STATUSES = {InstanceStatus.CARGADO, InstanceStatus.INSTALLED, InstanceStatus.CLOSED, InstanceStatus.WARRANTY}
BATCH_ROLES = {"DESIGN", "ADMIN", "MANAGER", "DIRECTOR"}
AUTHORIZER_ROLES = {"DIRECTOR", "MANAGER"}
ACTIVE = "ACTIVA"
CONSUMED = "CONSUMIDA"
CANCELLED = "CANCELADA"
REVERSED = "REVERTIDA"
RETURN_TO_STOCK = "RETURN_TO_STOCK"
EXIT_REASON = "ENTRADA_PRODUCCION"
DISPATCH_REASON = "SURTIDO_HERRAJES"
TRUCK_LOAD_REASON = "DESCARGA_EN_CARGA"
DISPATCH_ROLES = {"WAREHOUSE", "PRODUCTION", "DIRECTOR", "MANAGER", "ADMIN"}
PRODUCTION_GROUPS = {material_groups.MAIN, material_groups.CONSUMABLE}
STOCK_TOLERANCE = 0.0001


def _role(user) -> str:
    role = user.role
    return (role.value if hasattr(role, "value") else str(role)).upper()


def _require_roles(user, roles: set[str], message: str) -> None:
    if _role(user) not in roles:
        raise HTTPException(status_code=403, detail=message)


def _require_reason(reason: Optional[str], label: str) -> str:
    text = (reason or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail=f"{label} es obligatorio.")
    return text


def _require_reversal(user, reversal: Optional[ReversalCreate], context: str) -> ReversalCreate:
    if reversal is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "REVERSAL_REQUIRED", "message": f"{context} Indica motivo y si el material "
                    "regresa al almacén o se registra como merma."},
        )
    _require_roles(user, AUTHORIZER_ROLES, "Solo Dirección o Gerencia pueden revertir material descargado.")
    _require_reason(reversal.reason, "El motivo de la reversa")
    return reversal


def _parse_status(value: Optional[str]) -> ProductionBatchStatus:
    try:
        return ProductionBatchStatus(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Estado de lote no válido") from None


# ---------------------------------------------------------------------------
# Discharge
# ---------------------------------------------------------------------------

def compute_shortages(session: Session, reservations: list[InventoryReservation]) -> list[dict]:
    required: dict[int, float] = {}
    for res in reservations:
        required[res.material_id] = required.get(res.material_id, 0.0) + float(res.quantity_reserved or 0.0)
    materials = prod_inv_repo.get_materials_by_ids(session, list(required))
    shortages = []
    for material_id, quantity in required.items():
        material = materials.get(material_id)
        available = float(material.physical_stock or 0.0) if material else 0.0
        if quantity - available > STOCK_TOLERANCE:
            shortages.append({
                "material_id": material_id,
                "sku": material.sku if material else str(material_id),
                "name": material.name if material else "Material inexistente",
                "usage_unit": material.usage_unit if material else "",
                "required": round(quantity, 4),
                "available": round(available, 4),
                "missing": round(quantity - available, 4),
            })
    return shortages


def _authorize_shortages(
    session: Session, batch: ProductionBatch, shortages: list[dict], user, override_reason: Optional[str]
) -> Optional[int]:
    if not shortages:
        return None
    if not (override_reason or "").strip():
        raise HTTPException(
            status_code=409,
            detail={"code": "INSUFFICIENT_STOCK", "batch_folio": batch.folio, "shortages": shortages,
                    "message": f"No hay material suficiente para que el lote {batch.folio} entre a producción."},
        )
    _require_roles(user, AUTHORIZER_ROLES, "Solo Dirección o Gerencia pueden autorizar producción sin stock.")
    authorization = ProductionStockAuthorization(
        production_batch_id=batch.id,
        authorized_by_user_id=user.id,
        reason=override_reason.strip(),
        shortages=shortages,
    )
    session.add(authorization)
    session.flush()
    return authorization.id


def reservation_groups(session: Session, reservations: list[InventoryReservation]) -> dict[int, str]:
    """reservation id -> MAIN / CONSUMABLE / DISPATCH, by material category and the batch type."""
    materials = prod_inv_repo.get_materials_by_ids(session, [r.material_id for r in reservations])
    batch_types = {}
    for batch_id in {r.production_batch_id for r in reservations}:
        batch = prod_inv_repo.get_batch(session, batch_id)
        batch_types[batch_id] = batch.batch_type if batch else None
    return {
        r.id: material_groups.group_for(
            materials[r.material_id].category if r.material_id in materials else None,
            batch_types.get(r.production_batch_id),
        )
        for r in reservations
    }


def _consume(
    session: Session, reservations: list[InventoryReservation], user, reason: str,
    negative_ok: set[int], authorized: Optional[tuple[int, set[int]]] = None,
) -> int:
    """PRODUCTION_EXIT per reservation (cost per usage unit), releases committed stock, marks CONSUMIDA.
    authorized = (authorization id, reservation ids it covers)."""
    authorization_id, covered = authorized or (None, set())
    materials = prod_inv_repo.get_materials_by_ids(session, [r.material_id for r in reservations])
    order_ids = prod_inv_repo.get_order_ids_by_instance(session, [r.instance_id for r in reservations if r.instance_id])
    now = datetime.utcnow()
    for res in reservations:
        material = materials[res.material_id]
        quantity = float(res.quantity_reserved or 0.0)
        cost = inventory_service.usage_unit_cost(material)
        if quantity > 0:
            movement = inventory_service.register_movement(
                session, material.id, "PRODUCTION_EXIT", quantity, usage_cost=cost, reason=reason,
                project_id=order_ids.get(res.instance_id), operator_badge=getattr(user, "email", None),
                commit=False, allow_negative=res.id in negative_ok,
                trace={"production_batch_id": res.production_batch_id, "instance_id": res.instance_id,
                       "user_id": getattr(user, "id", None),
                       "authorization_id": authorization_id if res.id in covered else None},
            )
            res.consumed_movement_id = movement["movement_id"]
        material.committed_stock = max(0.0, float(material.committed_stock or 0.0) - quantity)
        res.status, res.consumed_at, res.consumed_unit_cost = CONSUMED, now, cost
        session.add_all([material, res])
    return len(reservations)


def discharge_reservations(
    session: Session, batch: ProductionBatch, reservations: list[InventoryReservation], user,
    override_reason: Optional[str] = None,
) -> int:
    """Entering production: main material (shortage blocks unless authorized) and factory consumables
    (never block). Hardware (DISPATCH group) is left ACTIVE until it is dispatched."""
    groups = reservation_groups(session, reservations)
    to_consume = [r for r in reservations if groups[r.id] in PRODUCTION_GROUPS]
    main = [r for r in to_consume if groups[r.id] == material_groups.MAIN]
    authorization_id = _authorize_shortages(session, batch, compute_shortages(session, main), user, override_reason)
    main_ids = {r.id for r in main}
    negative_ok = {r.id for r in to_consume if r.id not in main_ids or authorization_id}
    authorized = (authorization_id, main_ids) if authorization_id else None
    return _consume(session, to_consume, user, EXIT_REASON, negative_ok, authorized)


def payment_cleared(session: Session, instances: list[SalesOrderItemInstance]) -> bool:
    """Same rule as the Kanban padlock: not empty, and no OV with an agreed advance left unpaid."""
    if not instances:
        return False
    order_ids = list(prod_inv_repo.get_order_ids_by_instance(session, [i.id for i in instances]).values())
    return not prod_inv_repo.get_orders_with_unpaid_advance(session, order_ids)


def assert_advance_paid(session: Session, instances: list[SalesOrderItemInstance]) -> None:
    if not instances:
        raise HTTPException(status_code=400, detail="El lote no tiene instancias; no puede entrar a producción.")
    order_ids = list(prod_inv_repo.get_order_ids_by_instance(session, [i.id for i in instances]).values())
    pending = prod_inv_repo.get_orders_with_unpaid_advance(session, order_ids)
    if pending:
        folios = ", ".join(f"OV-{str(o.id).zfill(4)} ({o.project_name})" for o in pending)
        raise HTTPException(
            status_code=409,
            detail={"code": "ADVANCE_REQUIRED", "orders": [o.id for o in pending],
                    "message": f"Anticipo pactado sin pagar: {folios}. No puede entrar a producción."},
        )


# ---------------------------------------------------------------------------
# Reversal / release
# ---------------------------------------------------------------------------

def _mark_closed(res: InventoryReservation, status: str, user, reason: str, disposition: Optional[str]) -> None:
    res.status = status
    res.reversed_at = datetime.utcnow()
    res.reversed_by_user_id = getattr(user, "id", None)
    res.reversal_reason = reason
    res.reversal_disposition = disposition


def reverse_reservations(
    session: Session, reservations: list[InventoryReservation], user, reversal: ReversalCreate, recreate: bool
) -> int:
    """Consumed reservations: back to stock (PRODUCTION_RETURN) or waste (no stock movement).
    Dispatched hardware returned to stock clears the instance's dispatch flag so it can be dispatched again."""
    materials = prod_inv_repo.get_materials_by_ids(session, [r.material_id for r in reservations])
    groups = reservation_groups(session, reservations)
    if reversal.disposition == RETURN_TO_STOCK:
        _clear_dispatch_flags(session, {r.instance_id for r in reservations if groups[r.id] == material_groups.DISPATCH_GROUP})
    for res in reservations:
        if res.cogs_at is not None:
            raise HTTPException(status_code=400, detail="El material ya pasó a costo de venta; no se puede revertir.")
        material = materials[res.material_id]
        quantity = float(res.quantity_reserved or 0.0)
        if reversal.disposition == RETURN_TO_STOCK and quantity > 0:
            inventory_service.register_movement(
                session, material.id, "PRODUCTION_RETURN", quantity, usage_cost=float(res.consumed_unit_cost or 0.0),
                reason=reversal.reason.strip(), operator_badge=getattr(user, "email", None), commit=False,
                trace={"production_batch_id": res.production_batch_id, "instance_id": res.instance_id,
                       "user_id": user.id},
            )
        _mark_closed(res, REVERSED, user, reversal.reason.strip(), reversal.disposition)
        session.add(res)
        if recreate:
            session.add(InventoryReservation(
                production_batch_id=res.production_batch_id, instance_id=res.instance_id,
                material_id=res.material_id, quantity_reserved=quantity, status=ACTIVE,
            ))
            material.committed_stock = float(material.committed_stock or 0.0) + quantity
            session.add(material)
    return len(reservations)


def release_reservations(session: Session, reservations: list[InventoryReservation], user, reason: str) -> int:
    """Cancels ACTIVE reservations (material never left the warehouse) and frees committed stock."""
    materials = prod_inv_repo.get_materials_by_ids(session, [r.material_id for r in reservations])
    for res in reservations:
        material = materials.get(res.material_id)
        if material:
            material.committed_stock = max(0.0, float(material.committed_stock or 0.0) - float(res.quantity_reserved or 0.0))
            session.add(material)
        _mark_closed(res, CANCELLED, user, reason, None)
        session.add(res)
    return len(reservations)


# ---------------------------------------------------------------------------
# Batch status
# ---------------------------------------------------------------------------

def _sync_instances(
    session: Session, batch: ProductionBatch, instances: list[SalesOrderItemInstance],
    old_status: ProductionBatchStatus, new_status: ProductionBatchStatus,
) -> None:
    target = {
        ProductionBatchStatus.IN_PRODUCTION: InstanceStatus.IN_PRODUCTION,
        ProductionBatchStatus.READY_TO_INSTALL: InstanceStatus.READY,
    }.get(new_status)
    leaving = old_status in POST_PRODUCTION and new_status in PRE_PRODUCTION
    if target is None and not leaving:
        return
    for inst in instances:
        if inst.production_status in LOADED_STATUSES or inst.is_cancelled:
            continue
        if leaving:
            in_production = _other_track_in_production(session, inst, batch)
            inst.production_status = InstanceStatus.IN_PRODUCTION if in_production else InstanceStatus.PENDING
        else:
            inst.production_status = target
        session.add(inst)


def _leave_production(session: Session, batch: ProductionBatch, instances: list, user, payload: BatchStatusUpdate) -> None:
    if any(inst.production_status in LOADED_STATUSES for inst in instances):
        raise HTTPException(status_code=400, detail="El lote tiene instancias ya cargadas; no puede regresar.")
    consumed = prod_inv_repo.get_reservations(session, [CONSUMED], batch_id=batch.id)
    if not consumed:
        return
    reversal = _require_reversal(user, payload.reversal, f"El lote {batch.folio} ya descargó material del almacén.")
    reverse_reservations(session, consumed, user, reversal, recreate=True)


def change_batch_status(session: Session, batch_id: int, payload: BatchStatusUpdate, user) -> ProductionBatch:
    _require_roles(user, BATCH_ROLES, "No tienes permisos para esta operación.")
    batch = prod_inv_repo.get_batch(session, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    new_status = _parse_status(payload.status)
    if ProductionBatchStatus.DEAD in (new_status, batch.status):
        raise HTTPException(status_code=400, detail="Un lote DEAD lo marca el sistema y no cambia de estado.")
    instances = prod_inv_repo.get_batch_instances(session, batch)
    old_status = batch.status
    try:
        if batch.status in PRE_PRODUCTION and new_status in POST_PRODUCTION:
            assert_advance_paid(session, [i for i in instances if not i.is_cancelled])
            active = prod_inv_repo.get_reservations(session, [ACTIVE], batch_id=batch.id)
            discharge_reservations(session, batch, active, user, payload.override_reason)
            batch.started_at = batch.started_at or datetime.utcnow()
        elif batch.status in POST_PRODUCTION and new_status in PRE_PRODUCTION:
            _leave_production(session, batch, instances, user, payload)
        batch.status = new_status
        session.add(batch)
        _sync_instances(session, batch, instances, old_status, new_status)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(batch)
    return batch


def discharge_on_assign(
    session: Session, batch: ProductionBatch, instance: SalesOrderItemInstance, user, override_reason: Optional[str]
) -> int:
    """An instance assigned to a batch already in production is discharged right away."""
    if batch.status not in POST_PRODUCTION:
        return 0
    assert_advance_paid(session, [instance])
    session.flush()
    active = prod_inv_repo.get_reservations(session, [ACTIVE], batch_id=batch.id, instance_ids=[instance.id])
    return discharge_reservations(session, batch, active, user, override_reason)


# ---------------------------------------------------------------------------
# Instance removal, OV cancellation, truck load
# ---------------------------------------------------------------------------

def _other_track_in_production(session: Session, instance: SalesOrderItemInstance, batch: ProductionBatch) -> bool:
    is_stone = (batch.batch_type or "").upper() == "PIEDRA"
    other_id = instance.production_batch_id if is_stone else instance.stone_batch_id
    other = prod_inv_repo.get_batch(session, other_id) if other_id else None
    return other is not None and other.status in POST_PRODUCTION


def _detach_from_batch(session: Session, instance: SalesOrderItemInstance, batch: ProductionBatch) -> None:
    in_production = _other_track_in_production(session, instance, batch)
    if (batch.batch_type or "").upper() == "PIEDRA":
        instance.stone_batch_id = None
    else:
        instance.production_batch_id = None
    instance.production_status = InstanceStatus.IN_PRODUCTION if in_production else InstanceStatus.PENDING
    session.add(instance)


def remove_instance_from_batch(
    session: Session, batch_id: int, instance_id: int, payload: InstanceRemovalCreate, user
) -> SalesOrderItemInstance:
    _require_roles(user, BATCH_ROLES, "No tienes permisos para esta operación.")
    batch = prod_inv_repo.get_batch(session, batch_id)
    instance = prod_inv_repo.get_instance(session, instance_id)
    if not batch or not instance:
        raise HTTPException(status_code=404, detail="Lote o instancia no encontrados.")
    if batch.id not in (instance.production_batch_id, instance.stone_batch_id):
        raise HTTPException(status_code=400, detail="La instancia no pertenece a este lote.")
    if instance.production_status in LOADED_STATUSES:
        raise HTTPException(status_code=400, detail="La instancia ya fue cargada; no puede salir del lote.")
    reason = _require_reason(payload.reason, "El motivo")
    try:
        consumed = prod_inv_repo.get_reservations(session, [CONSUMED], batch_id=batch.id, instance_ids=[instance.id])
        if consumed:
            reversal = _require_reversal(user, payload.reversal, "La instancia ya descargó material del almacén.")
            reverse_reservations(session, consumed, user, reversal, recreate=False)
        active = prod_inv_repo.get_reservations(session, [ACTIVE], batch_id=batch.id, instance_ids=[instance.id])
        release_reservations(session, active, user, reason)
        _detach_from_batch(session, instance, batch)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(instance)
    return instance


def release_for_cancelled_order(session: Session, order_id: int, user, reversal: Optional[ReversalCreate]) -> None:
    """Frees or reverses the material of an OV being cancelled. Caller commits."""
    instances = prod_inv_repo.get_order_instances(session, order_id)
    if any(inst.production_status in LOADED_STATUSES for inst in instances):
        raise HTTPException(status_code=400, detail="La OV tiene instancias ya cargadas; no puede cancelarse.")
    ids = [inst.id for inst in instances]
    consumed = prod_inv_repo.get_reservations(session, [CONSUMED], instance_ids=ids)
    reason = "Cancelación de OV"
    if consumed:
        affected = {r.instance_id for r in consumed}
        names = ", ".join(sorted(inst.custom_name for inst in instances if inst.id in affected))
        checked = _require_reversal(user, reversal, f"Estas instancias ya descargaron material: {names}.")
        reverse_reservations(session, consumed, user, checked, recreate=False)
        reason = checked.reason.strip()
    release_reservations(session, prod_inv_repo.get_reservations(session, [ACTIVE], instance_ids=ids), user, reason)
    for inst in instances:
        inst.production_batch_id = None
        inst.stone_batch_id = None
        session.add(inst)


def _clear_dispatch_flags(session: Session, instance_ids: set) -> None:
    for instance_id in instance_ids - {None}:
        instance = prod_inv_repo.get_instance(session, instance_id)
        if instance and instance.hardware_dispatched:
            instance.hardware_dispatched = False
            instance.hardware_dispatched_at = None
            instance.hardware_dispatched_by_user_id = None
            session.add(instance)


def _mark_dispatched(session: Session, instance: SalesOrderItemInstance, user) -> None:
    instance.hardware_dispatched = True
    instance.hardware_dispatched_at = datetime.utcnow()
    instance.hardware_dispatched_by_user_id = getattr(user, "id", None)
    session.add(instance)


def dispatch_instance_hardware(session: Session, instance_id: int, user) -> dict:
    """Hardware handed to production: discharges the instance's DISPATCH-group reservations (may go negative)."""
    _require_roles(user, DISPATCH_ROLES, "No tienes permisos para surtir herrajes.")
    instance = prod_inv_repo.get_instance(session, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada")
    if instance.hardware_dispatched:
        raise HTTPException(status_code=400, detail="Los herrajes ya fueron marcados como surtidos")
    active = prod_inv_repo.get_reservations(session, [ACTIVE], instance_ids=[instance.id])
    groups = reservation_groups(session, active)
    hardware = [r for r in active if groups[r.id] == material_groups.DISPATCH_GROUP]
    try:
        _consume(session, hardware, user, DISPATCH_REASON, negative_ok={r.id for r in hardware})
        _mark_dispatched(session, instance, user)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(instance)
    return {"ok": True, "instance_id": instance.id, "hardware_dispatched_at": instance.hardware_dispatched_at,
            "hardware_dispatched_by_user_id": instance.hardware_dispatched_by_user_id,
            "materials_discharged": len(hardware)}


def transfer_instance_to_cogs(session: Session, instance_id: int, user=None) -> int:
    """Truck load: discharges anything still reserved (safety net for hardware never dispatched), then the
    instance's consumed material leaves inventory and becomes cost of sales. Caller commits."""
    leftover = prod_inv_repo.get_reservations(session, [ACTIVE], instance_ids=[instance_id])
    if leftover:
        groups = reservation_groups(session, leftover)
        _consume(session, leftover, user, TRUCK_LOAD_REASON, negative_ok={r.id for r in leftover})
        instance = prod_inv_repo.get_instance(session, instance_id)
        if instance and not instance.hardware_dispatched and any(g == material_groups.DISPATCH_GROUP for g in groups.values()):
            _mark_dispatched(session, instance, user)
    now = datetime.utcnow()
    pending = [r for r in prod_inv_repo.get_reservations(session, [CONSUMED], instance_ids=[instance_id]) if r.cogs_at is None]
    for res in pending:
        res.cogs_at = now
        session.add(res)
    return len(pending)
