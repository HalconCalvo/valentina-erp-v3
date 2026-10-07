"""Blind physical inventory with a cut date.

- The session counts as of the cut (23:59:59 America/Merida). Theoretical stock is the sum of movements with
  effective date <= cut, recalculated on submit and again when each line is approved.
- Adjustments are INVENTORY_DIFF_IN/OUT dated at the cut, valued at the last purchase cost effective at the
  cut, and linked to the session and line. Movements after the cut are kept.
- Closing the session locks the period; DIRECTOR can reopen with a reason, recount lines (reversal + new
  adjustment, never DELETE) and close again.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.core.business_time import cut_end_utc, format_local_date, today_local
from app.models.inventory import InventoryAudit, InventoryAuditItem, InventoryAuditItemRecount, InventoryPeriodLock
from app.models.material import Material
from app.repositories import inventory_repository as inventory_repo
from app.schemas.inventory_audit_schema import (
    AuditCreate,
    AuditItemRecountCreate,
    AuditReopenCreate,
    AuditSettingsUpdate,
)
from app.services import inventory_service

AUDIT_CAPTURE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
AUDIT_LIST_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
AUDIT_APPROVE_ROLES = {"DIRECTOR", "MANAGER"}
AUDIT_CANCEL_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
AUDIT_REOPEN_ROLES = {"DIRECTOR"}
EN_CAPTURA = "EN_CAPTURA"
ESPERANDO = "ESPERANDO_AUTORIZACION"
CERRADA = "CERRADA"
REABIERTA = "REABIERTA"
CANCELADA = "CANCELADA"
VARIANCE_THRESHOLD = 0.05
DEFAULT_VALUE_THRESHOLD = 2000.0
QTY_TOLERANCE = 0.0001
REASON_PERCENT = "PERCENT"
REASON_ZERO = "ZERO_THEORETICAL"
REASON_NEGATIVE = "NEGATIVE_THEORETICAL"
REASON_VALUE = "VALUE"


def _assert_roles(user, roles: set[str]) -> None:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role.upper() not in roles:
        raise HTTPException(status_code=403, detail="Sin permisos para esta operación.")


def _require_text(value: Optional[str], label: str) -> str:
    text = (value or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail=f"{label} es obligatorio.")
    return text


def _get_audit(session: Session, audit_id: int, statuses: set[str]) -> InventoryAudit:
    audit = inventory_repo.get_audit_by_id(session, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Sesión de inventario no encontrada.")
    if audit.status not in statuses:
        raise HTTPException(status_code=400, detail=f"Operación no válida para una sesión {audit.status}.")
    if audit.cut_at is None:
        raise HTTPException(status_code=400, detail="Sesión sin fecha de corte (anterior a este cambio); cancélala y crea una nueva.")
    return audit


def _get_item(session: Session, audit_id: int, item_id: int) -> InventoryAuditItem:
    item = inventory_repo.get_audit_item_by_id(session, item_id)
    if not item or item.audit_id != audit_id:
        raise HTTPException(status_code=404, detail="Línea de conteo no encontrada.")
    return item


# ---------------------------------------------------------------------------
# Approval rule
# ---------------------------------------------------------------------------

def value_threshold(session: Session) -> float:
    config = inventory_repo.get_global_config(session)
    value = getattr(config, "inventory_audit_value_threshold", None) if config else None
    return float(value) if value is not None else DEFAULT_VALUE_THRESHOLD


def approval_reasons(theoretical: float, counted: float, unit_cost: float, threshold: float) -> list[str]:
    """T = theoretical at cut, C = counted, D = C - T. Empty list means it adjusts automatically."""
    difference = counted - theoretical
    if abs(difference) <= QTY_TOLERANCE:
        return []
    reasons = []
    if abs(theoretical) <= QTY_TOLERANCE:
        reasons.append(REASON_ZERO)
    elif theoretical < 0:
        reasons.append(REASON_NEGATIVE)
    elif abs(difference) / theoretical > VARIANCE_THRESHOLD:
        reasons.append(REASON_PERCENT)
    if abs(difference) * unit_cost > threshold:
        reasons.append(REASON_VALUE)
    return reasons


def _cost_at_cut(session: Session, material: Material, cut_at: datetime) -> float:
    cost = inventory_repo.get_last_purchase_cost_at(session, material.id, cut_at)
    return float(cost) if cost is not None else inventory_service.usage_unit_cost(material)


# ---------------------------------------------------------------------------
# Adjustments
# ---------------------------------------------------------------------------

def _post_difference(
    session: Session, audit: InventoryAudit, item: InventoryAuditItem, user, quantity: float, unit_cost: float,
    reason: str, reverses_movement_id: Optional[int] = None,
) -> int:
    movement = inventory_service.register_movement(
        session, item.material_id, "INVENTORY_DIFF_IN" if quantity > 0 else "INVENTORY_DIFF_OUT", abs(quantity),
        usage_cost=unit_cost, reason=reason, operator_badge=getattr(user, "email", None),
        created_at=audit.cut_at, commit=False, allow_negative=True,
        trace={"audit_id": audit.id, "audit_item_id": item.id, "user_id": user.id,
               "reverses_movement_id": reverses_movement_id},
    )
    return movement["movement_id"]


def _apply_item_adjustment(
    session: Session, audit: InventoryAudit, item: InventoryAuditItem, user, notes: str,
    theoretical: Optional[float] = None,
) -> None:
    """Recalculates the theoretical stock at the cut and posts the difference dated at the cut."""
    if theoretical is None:
        theoretical = inventory_repo.calcular_saldo_a_fecha(session, item.material_id, audit.cut_at)
    material = inventory_repo.get_material_by_id(session, item.material_id)
    variance = float(item.counted_quantity or 0.0) - theoretical
    item.system_quantity, item.variance = theoretical, variance
    if abs(variance) > QTY_TOLERANCE:
        item.unit_cost_at_cut = _cost_at_cut(session, material, audit.cut_at)
        item.adjustment_movement_id = _post_difference(
            session, audit, item, user, variance, item.unit_cost_at_cut, notes or f"Inventario físico #{audit.id}"
        )
    item.approved_by_id = user.id
    item.approved_at = datetime.utcnow()
    item.approval_notes = notes
    session.add(item)


def _classify_item(session: Session, audit: InventoryAudit, item: InventoryAuditItem, theoretical: float,
                   threshold: float) -> bool:
    variance = float(item.counted_quantity or 0.0) - theoretical
    item.system_quantity, item.variance = theoretical, variance
    cost = 0.0
    if abs(variance) > QTY_TOLERANCE:
        cost = _cost_at_cut(session, inventory_repo.get_material_by_id(session, item.material_id), audit.cut_at)
        item.unit_cost_at_cut = cost
    reasons = approval_reasons(theoretical, float(item.counted_quantity or 0.0), cost, threshold)
    item.requires_approval = bool(reasons)
    item.approval_reason = ",".join(reasons) or None
    session.add(item)
    return item.requires_approval


def _resolve_uncaptured(session: Session, items: list[InventoryAuditItem], balances: dict[int, float]) -> None:
    """Uncaptured lines with theoretical 0 count as 0; any other uncaptured line blocks the submit."""
    uncaptured = [i for i in items if i.counted_quantity is None and i.approved_at is None]
    blocked = [i for i in uncaptured if abs(balances.get(i.material_id, 0.0)) > QTY_TOLERANCE]
    if blocked:
        materials = inventory_repo.get_materials_by_ids(session, [i.material_id for i in blocked])
        raise HTTPException(
            status_code=422,
            detail={
                "code": "UNCAPTURED_WITH_STOCK",
                "message": f"Faltan {len(blocked)} materiales por contar que tienen existencia en el sistema.",
                "materials": [{"sku": materials[i.material_id].sku, "name": materials[i.material_id].name}
                              for i in blocked],
            },
        )
    for item in uncaptured:
        item.counted_quantity, item.variance, item.auto_zero = 0.0, 0.0, True
        session.add(item)


def _close_audit(session: Session, audit: InventoryAudit, user) -> None:
    audit.status = CERRADA
    audit.closed_at = datetime.utcnow()
    audit.authorized_by_id = user.id
    session.add(audit)
    session.add(InventoryPeriodLock(audit_id=audit.id, locked_until=audit.cut_at, created_by_user_id=user.id))


def _item_is_resolved(item: InventoryAuditItem) -> bool:
    return item.approved_at is not None or abs(float(item.variance or 0.0)) <= QTY_TOLERANCE or not item.requires_approval


def _pending_approval_items(items: list[InventoryAuditItem]) -> list[InventoryAuditItem]:
    return [i for i in items if i.requires_approval and i.approved_at is None and abs(float(i.variance or 0.0)) > QTY_TOLERANCE]


def _maybe_close_audit(session: Session, audit: InventoryAudit, user) -> None:
    if all(_item_is_resolved(i) for i in inventory_repo.get_audit_items(session, audit.id)):
        _close_audit(session, audit, user)


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _should_blind_audit(audit: InventoryAudit, user) -> bool:
    role = (user.role.value if hasattr(user.role, "value") else str(user.role)).upper()
    return audit.status == EN_CAPTURA or (audit.status == ESPERANDO and role not in AUDIT_APPROVE_ROLES)


def _serialize_audit_item(item: InventoryAuditItem, material: Optional[Material], blind: bool) -> dict:
    payload = {
        "id": item.id, "audit_id": item.audit_id, "material_id": item.material_id,
        "material_sku": material.sku if material else None, "material_name": material.name if material else None,
        "usage_unit": material.usage_unit if material else None,
        "counted_quantity": item.counted_quantity, "captured": item.counted_quantity is not None,
    }
    if not blind:
        cost = float(item.unit_cost_at_cut or 0.0)
        payload.update({
            "system_quantity": item.system_quantity, "variance": item.variance,
            "requires_approval": item.requires_approval, "approval_reason": item.approval_reason,
            "approved_by_id": item.approved_by_id, "approved_at": item.approved_at,
            "approval_notes": item.approval_notes, "resolved": _item_is_resolved(item),
            "auto_zero": item.auto_zero, "unit_cost_at_cut": item.unit_cost_at_cut,
            "valued_difference": round(float(item.variance or 0.0) * cost, 2),
            "adjustment_movement_id": item.adjustment_movement_id,
        })
    return payload


def _serialize_audit(session: Session, audit: InventoryAudit, user, blind: Optional[bool] = None) -> dict:
    use_blind = _should_blind_audit(audit, user) if blind is None else blind
    items = inventory_repo.get_audit_items(session, audit.id)
    materials = inventory_repo.get_materials_by_ids(session, [i.material_id for i in items])
    serialized = [_serialize_audit_item(i, materials.get(i.material_id), use_blind) for i in items]
    return {
        "id": audit.id, "status": audit.status, "scheduled_date": audit.scheduled_date,
        "cut_date": audit.cut_date, "cut_at": audit.cut_at, "closed_at": audit.closed_at,
        "auditor_id": audit.auditor_id, "authorized_by_id": audit.authorized_by_id, "notes": audit.notes,
        "created_at": audit.created_at, "items": serialized, "items_total": len(serialized),
        "items_captured": sum(1 for i in items if i.counted_quantity is not None),
        "items_pending_approval": len(_pending_approval_items(items)),
        "total_valued_difference": None if use_blind else round(sum(i["valued_difference"] for i in serialized), 2),
        "value_threshold": value_threshold(session),
    }


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

def create_audit_session(session: Session, payload: AuditCreate, current_user) -> dict:
    _assert_roles(current_user, AUDIT_CAPTURE_ROLES)
    if inventory_repo.get_active_audit_session(session):
        raise HTTPException(status_code=409, detail="Ya existe una sesión de inventario físico activa.")
    if inventory_repo.get_reopened_audit(session):
        raise HTTPException(status_code=409, detail="Hay un corte reabierto; ciérralo antes de iniciar otro.")
    if payload.cut_date > today_local():
        raise HTTPException(status_code=400, detail="La fecha de corte no puede ser futura.")
    cut_at = cut_end_utc(payload.cut_date)
    locks = inventory_repo.get_active_locks(session)
    if locks and cut_at <= locks[0].locked_until:
        raise HTTPException(status_code=400, detail=f"El periodo está cerrado al {format_local_date(locks[0].locked_until)}.")
    audit = InventoryAudit(status=EN_CAPTURA, auditor_id=current_user.id, cut_date=payload.cut_date, cut_at=cut_at,
                           scheduled_date=cut_at, notes=(payload.notes or "").strip() or None)
    session.add(audit)
    session.flush()
    balances = inventory_repo.get_balances_at(session, cut_at)
    for material in inventory_repo.get_all_active_materials(session):
        session.add(InventoryAuditItem(audit_id=audit.id, material_id=material.id,
                                       system_quantity=balances.get(material.id, 0.0)))
    session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=True)


def capture_count(session: Session, audit_id: int, item_id: int, counted_quantity: float, current_user) -> dict:
    _assert_roles(current_user, AUDIT_CAPTURE_ROLES)
    _get_audit(session, audit_id, {EN_CAPTURA})
    item = _get_item(session, audit_id, item_id)
    if item.approved_at is not None:
        raise HTTPException(status_code=409, detail="Esta línea ya fue procesada.")
    counted = float(counted_quantity or 0.0)
    if counted < 0:
        raise HTTPException(status_code=422, detail="La cantidad contada no puede ser negativa.")
    item.counted_quantity = counted
    item.auto_zero = False
    session.add(item)
    session.commit()
    session.refresh(item)
    return _serialize_audit_item(item, inventory_repo.get_material_by_id(session, item.material_id), blind=True)


def submit_for_approval(session: Session, audit_id: int, current_user) -> dict:
    _assert_roles(current_user, AUDIT_CAPTURE_ROLES)
    audit = _get_audit(session, audit_id, {EN_CAPTURA})
    items = inventory_repo.get_audit_items(session, audit_id)
    balances = inventory_repo.get_balances_at(session, audit.cut_at)
    _resolve_uncaptured(session, items, balances)
    threshold = value_threshold(session)
    pending = False
    for item in items:
        if item.approved_at is not None:
            continue
        theoretical = balances.get(item.material_id, 0.0)
        if _classify_item(session, audit, item, theoretical, threshold):
            pending = True
            continue
        _apply_item_adjustment(session, audit, item, current_user, "Ajuste automático (dentro de umbrales)", theoretical)
    if pending:
        audit.status = ESPERANDO
        session.add(audit)
    else:
        _close_audit(session, audit, current_user)
    session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user)


def approve_audit_item(session: Session, audit_id: int, item_id: int, notes: Optional[str], current_user) -> dict:
    _assert_roles(current_user, AUDIT_APPROVE_ROLES)
    audit = _get_audit(session, audit_id, {ESPERANDO})
    item = _get_item(session, audit_id, item_id)
    if not item.requires_approval:
        raise HTTPException(status_code=400, detail="Este material no requiere aprobación.")
    if item.approved_at is not None:
        raise HTTPException(status_code=409, detail="Este material ya fue aprobado.")
    _apply_item_adjustment(session, audit, item, current_user, notes or "Aprobación de excepción de inventario")
    _maybe_close_audit(session, audit, current_user)
    session.commit()
    session.refresh(item)
    return _serialize_audit_item(item, inventory_repo.get_material_by_id(session, item.material_id), blind=False)


def approve_audit(session: Session, audit_id: int, current_user) -> dict:
    _assert_roles(current_user, AUDIT_APPROVE_ROLES)
    audit = _get_audit(session, audit_id, {ESPERANDO})
    pending = _pending_approval_items(inventory_repo.get_audit_items(session, audit_id))
    if not pending:
        raise HTTPException(status_code=400, detail="No hay materiales pendientes de aprobación.")
    for item in pending:
        _apply_item_adjustment(session, audit, item, current_user, "Aprobación masiva de excepción de inventario")
    _maybe_close_audit(session, audit, current_user)
    session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=False)


def _append_note(audit: InventoryAudit, label: str, reason: str) -> None:
    stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    audit.notes = f"{audit.notes or ''}\n[{label} {stamp}]: {reason}".strip()


def reject_audit(session: Session, audit_id: int, reason: str, current_user) -> dict:
    _assert_roles(current_user, AUDIT_APPROVE_ROLES)
    reason_text = _require_text(reason, "El motivo de rechazo")
    with audit_reason(reason_text):
        audit = _get_audit(session, audit_id, {ESPERANDO})
        _append_note(audit, "RECHAZO", reason_text)
        audit.status = EN_CAPTURA
        audit.authorized_by_id = None
        for item in inventory_repo.get_audit_items(session, audit_id):
            if item.requires_approval and item.approved_at is None:
                item.counted_quantity, item.variance, item.requires_approval, item.approval_reason = None, None, False, None
                session.add(item)
        session.add(audit)
        session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=True)


def cancel_audit(session: Session, audit_id: int, reason: str, current_user) -> dict:
    _assert_roles(current_user, AUDIT_CANCEL_ROLES)
    reason_text = _require_text(reason, "El motivo de cancelación")
    with audit_reason(reason_text):
        audit = inventory_repo.get_audit_by_id(session, audit_id)
        if not audit:
            raise HTTPException(status_code=404, detail="Sesión de inventario no encontrada.")
        if audit.status not in {EN_CAPTURA, ESPERANDO}:
            raise HTTPException(status_code=400, detail="Solo se pueden cancelar sesiones activas.")
        _append_note(audit, "CANCELACIÓN", reason_text)
        audit.status = CANCELADA
        session.add(audit)
        session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=False)


# ---------------------------------------------------------------------------
# Period lock: reopen, recount, close again
# ---------------------------------------------------------------------------

def reopen_audit(session: Session, audit_id: int, payload: AuditReopenCreate, current_user) -> dict:
    _assert_roles(current_user, AUDIT_REOPEN_ROLES)
    reason = _require_text(payload.reason, "El motivo de reapertura")
    with audit_reason(reason):
        audit = _get_audit(session, audit_id, {CERRADA})
        lock = inventory_repo.get_active_lock_for_audit(session, audit.id)
        later = [lk for lk in inventory_repo.get_active_locks(session) if lk.locked_until > audit.cut_at]
        if later:
            raise HTTPException(status_code=400, detail=f"Primero reabre el corte posterior al {format_local_date(later[0].locked_until)}.")
        if lock:
            lock.released_at, lock.released_by_user_id, lock.release_reason = datetime.utcnow(), current_user.id, reason
            session.add(lock)
        _append_note(audit, "REAPERTURA", reason)
        audit.status = REABIERTA
        session.add(audit)
        session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=False)


def close_again(session: Session, audit_id: int, current_user) -> dict:
    _assert_roles(current_user, AUDIT_REOPEN_ROLES)
    audit = _get_audit(session, audit_id, {REABIERTA})
    _close_audit(session, audit, current_user)
    session.commit()
    session.refresh(audit)
    return _serialize_audit(session, audit, current_user, blind=False)


def recount_item(session: Session, audit_id: int, item_id: int, payload: AuditItemRecountCreate, current_user) -> dict:
    _assert_roles(current_user, AUDIT_APPROVE_ROLES)
    reason = _require_text(payload.reason, "El motivo del reconteo")
    with audit_reason(reason):
        if payload.counted_quantity < 0:
            raise HTTPException(status_code=422, detail="La cantidad contada no puede ser negativa.")
        audit = _get_audit(session, audit_id, {REABIERTA})
        item = _get_item(session, audit_id, item_id)
        previous_counted, reversed_id = item.counted_quantity, None
        if item.adjustment_movement_id:
            previous = inventory_repo.get_movement(session, item.adjustment_movement_id)
            reversed_id = _post_difference(session, audit, item, current_user, -float(previous.quantity),
                                           float(previous.unit_cost or 0.0), reason, reverses_movement_id=previous.id)
        item.counted_quantity, item.adjustment_movement_id = float(payload.counted_quantity), None
        _apply_item_adjustment(session, audit, item, current_user, reason)
        session.add(InventoryAuditItemRecount(
            audit_item_id=item.id, previous_counted=previous_counted, new_counted=float(payload.counted_quantity),
            reason=reason, user_id=current_user.id, reversed_movement_id=reversed_id,
            new_movement_id=item.adjustment_movement_id,
        ))
        session.commit()
    session.refresh(item)
    return _serialize_audit_item(item, inventory_repo.get_material_by_id(session, item.material_id), blind=False)


# ---------------------------------------------------------------------------
# Queries and settings
# ---------------------------------------------------------------------------

def get_period_lock(session: Session, current_user) -> dict:
    _assert_roles(current_user, AUDIT_LIST_ROLES)
    locks = inventory_repo.get_active_locks(session)
    if not locks:
        return {"locked": False}
    return {"locked": True, "locked_until": locks[0].locked_until,
            "locked_until_local": format_local_date(locks[0].locked_until), "audit_id": locks[0].audit_id}


def get_audit_settings(session: Session, current_user) -> dict:
    _assert_roles(current_user, AUDIT_LIST_ROLES)
    return {"inventory_audit_value_threshold": value_threshold(session)}


def update_audit_settings(session: Session, payload: AuditSettingsUpdate, current_user) -> dict:
    _assert_roles(current_user, AUDIT_REOPEN_ROLES)
    if payload.inventory_audit_value_threshold <= 0:
        raise HTTPException(status_code=422, detail="El umbral debe ser mayor a cero.")
    config = inventory_repo.get_global_config(session)
    if not config:
        raise HTTPException(status_code=400, detail="No existe configuración global.")
    config.inventory_audit_value_threshold = round(float(payload.inventory_audit_value_threshold), 2)
    session.add(config)
    session.commit()
    return {"inventory_audit_value_threshold": config.inventory_audit_value_threshold}


def get_active_audit(session: Session, current_user) -> Optional[dict]:
    _assert_roles(current_user, AUDIT_CAPTURE_ROLES | AUDIT_APPROVE_ROLES)
    audit = inventory_repo.get_active_audit_session(session) or inventory_repo.get_reopened_audit(session)
    return _serialize_audit(session, audit, current_user) if audit else None


def get_audit_detail(session: Session, audit_id: int, current_user) -> dict:
    _assert_roles(current_user, AUDIT_CAPTURE_ROLES | AUDIT_APPROVE_ROLES | inventory_service.KARDEX_VIEW_ROLES)
    audit = inventory_repo.get_audit_by_id(session, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Sesión de inventario no encontrada.")
    return _serialize_audit(session, audit, current_user)


def list_audit_sessions(session: Session, current_user, status: Optional[str] = None) -> list[dict]:
    _assert_roles(current_user, AUDIT_LIST_ROLES)
    result = []
    for audit in inventory_repo.get_all_audits(session, status):
        items = inventory_repo.get_audit_items(session, audit.id)
        result.append({
            "id": audit.id, "status": audit.status, "created_at": audit.created_at,
            "scheduled_date": audit.scheduled_date, "cut_date": audit.cut_date, "closed_at": audit.closed_at,
            "auditor_id": audit.auditor_id, "authorized_by_id": audit.authorized_by_id, "notes": audit.notes,
            "items_total": len(items), "items_captured": sum(1 for i in items if i.counted_quantity is not None),
        })
    return result
