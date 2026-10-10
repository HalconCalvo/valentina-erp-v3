"""Change orders (CAM) of a sales order — everything that moves money after the OV exists.

A change order is a Quotation (kind CHANGE_ORDER) linked to its sales order. Each line is an operation:
ADD, QUANTITY_UP, QUANTITY_DOWN, PRICE, CANCEL_LINE. It follows the quotation lifecycle (only the Director
authorizes) and, once authorized, is applied to the same OV in one transaction: lines and units are added
or cancelled (never deleted), material of cancelled units is released or reversed as the Director decided,
and the OV totals, balance and advance are recomputed. Folio: CAM-<OV>-<n>.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.sales import (
    ChangeType,
    InstanceStatus,
    Quotation,
    QuotationItem,
    QuotationKind,
    QuotationStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.models.users import User
from app.repositories import quotation_repository as quotation_repo
from app.repositories import sales_repository as sales_repo
from app.schemas.quotation_schema import (
    ChangeOrderApply,
    ChangeOrderAuthorize,
    ChangeOrderCreate,
    ChangeOrderLine,
    ChangeOrderUpdate,
    QuotationRead,
)
from app.schemas.sales_schema import SalesOrderItemCreate
from app.services import (
    margin_service, production_inventory_service, quotation_service, sales_service, seller_pricing_service,
)
from app.services.cost_engine import CostEngine

_EDIT_ROLES = {"DIRECTOR", "MANAGER", "SALES"}
_AUTHORIZE_ROLES = {"DIRECTOR"}
OPEN_STATUSES = {QuotationStatus.DRAFT, QuotationStatus.PENDING_AUTH,
                 QuotationStatus.CHANGES_REQUESTED, QuotationStatus.AUTHORIZED}
CHANGEABLE_ORDER_STATUSES = {SalesOrderStatus.WAITING_ADVANCE, SalesOrderStatus.SOLD, SalesOrderStatus.FINISHED}
SIGNED_STATUSES = {InstanceStatus.CLOSED, InstanceStatus.WARRANTY}
DISPOSITIONS = {"RETURN_TO_STOCK", "WASTE"}
VALIDITY_DAYS = 30


# ---------------------------------------------------------------------------
# Access and state
# ---------------------------------------------------------------------------

def _role(user: User) -> str:
    return sales_service._normalized_role(user)


def _get_change(session: Session, change_id: int) -> Quotation:
    change = quotation_repo.get_quotation_by_id(session, change_id)
    if not change or change.kind != QuotationKind.CHANGE_ORDER:
        raise HTTPException(status_code=404, detail="Orden de cambio no encontrada")
    return change


def _get_change_for_edit(session: Session, change_id: int, user: User) -> Quotation:
    if _role(user) not in _EDIT_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para gestionar órdenes de cambio.")
    change = _get_change(session, change_id)
    if sales_service._is_seller_scoped_role(user) and change.user_id != user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return change


def _active_units(item: SalesOrderItem) -> List[SalesOrderItemInstance]:
    return [i for i in item.instances if not i.is_cancelled]


def assert_order_open(session: Session, order: SalesOrder) -> None:
    """Waiting advance, sold or paid off, while at least one unit is not signed by the client yet."""
    if order.status not in CHANGEABLE_ORDER_STATUSES:
        raise HTTPException(status_code=409, detail="La OV no admite órdenes de cambio en su estado actual.")
    units = [u for item in sales_repo.get_active_items_by_order(session, order.id) for u in _active_units(item)]
    has_open_unit = any(u.production_status not in SIGNED_STATUSES for u in units)
    if not has_open_unit and (units or order.status == SalesOrderStatus.FINISHED):
        raise HTTPException(status_code=409, detail="Todas las unidades de la OV ya están firmadas de conformidad. "
                            "Un adicional va por cotización nueva (OV complementaria).")


def _assert_no_open_change(session: Session, order_id: int, exclude_id: Optional[int] = None) -> None:
    for change in quotation_repo.get_change_orders(session, order_id, OPEN_STATUSES):
        if change.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"La OV ya tiene una orden de cambio abierta "
                                f"({quotation_service.quotation_folio(change)}).")


# ---------------------------------------------------------------------------
# Line validation
# ---------------------------------------------------------------------------

def _is_invoiced(unit: SalesOrderItemInstance) -> bool:
    return unit.customer_payment_id is not None or bool(unit.administration_invoice_folio)


def _assert_cancellable(session: Session, units: list, line: ChangeOrderLine, require_dispositions: bool) -> None:
    for unit in units:
        if unit.production_status in production_inventory_service.LOADED_STATUSES:
            raise HTTPException(status_code=409, detail=f"{unit.custom_name} ya fue cargada o instalada; "
                                "no se puede cancelar por orden de cambio.")
        if _is_invoiced(unit):
            raise HTTPException(status_code=409, detail=f"{unit.custom_name} ya está facturada; no se puede cancelar.")
        needs = production_inventory_service.instance_needs_reversal(session, unit)
        if needs and require_dispositions and line.reversal_dispositions.get(str(unit.id)) not in DISPOSITIONS:
            raise HTTPException(status_code=422, detail=f"{unit.custom_name} ya descargó material: indica si "
                                "regresa al almacén o es merma.")


def _units_to_cancel(item: SalesOrderItem, line: ChangeOrderLine) -> List[SalesOrderItemInstance]:
    active = {u.id: u for u in _active_units(item)}
    if line.change_type == ChangeType.CANCEL_LINE:
        return list(active.values())
    ids = list(dict.fromkeys(line.cancel_instance_ids))
    if not ids or any(i not in active for i in ids):
        raise HTTPException(status_code=422, detail=f"Elige unidades activas de {item.product_name} para cancelar.")
    return [active[i] for i in ids]


def _check_add(line: ChangeOrderLine) -> None:
    if not (line.product_name or "").strip():
        raise HTTPException(status_code=422, detail="La partida nueva necesita nombre.")
    if line.quantity <= 0 or line.unit_price < 0:
        raise HTTPException(status_code=422, detail="Cantidad mayor a cero y precio no negativo.")
    if not line.is_resale and line.quantity != int(line.quantity):
        raise HTTPException(status_code=422, detail="Las partidas de producción van por unidades enteras.")


def _check_target(session: Session, item: SalesOrderItem, line: ChangeOrderLine, require_dispositions: bool) -> None:
    kind = line.change_type
    current = float(item.quantity or 0)
    if kind == ChangeType.QUANTITY_UP:
        if line.quantity <= current or (not item.is_resale and line.quantity != int(line.quantity)):
            raise HTTPException(status_code=422, detail=f"La cantidad nueva de {item.product_name} debe ser mayor "
                                f"a la actual ({current:g}).")
    elif kind == ChangeType.PRICE:
        if line.unit_price < 0:
            raise HTTPException(status_code=422, detail="El precio no puede ser negativo.")
        if any(_is_invoiced(u) for u in _active_units(item)):
            raise HTTPException(status_code=409, detail=f"{item.product_name} tiene unidades facturadas: no se cambia "
                                "su precio. Cancela lo no facturado y agrega una partida con el precio nuevo.")
    elif item.is_resale:
        if kind == ChangeType.QUANTITY_DOWN and not 0 < line.quantity < current:
            raise HTTPException(status_code=422, detail=f"La cantidad nueva de {item.product_name} debe ser menor a la "
                                f"actual ({current:g}) y mayor a cero; para quitarla toda cancela la partida.")
    else:
        _assert_cancellable(session, _units_to_cancel(item, line), line, require_dispositions)


def validate_lines(session: Session, order: SalesOrder, lines: List[ChangeOrderLine], require_dispositions: bool) -> Dict[int, SalesOrderItem]:
    """Checks every operation against the current state of the OV; returns the target lines by id."""
    targets: Dict[int, SalesOrderItem] = {}
    for line in lines:
        if line.change_type == ChangeType.ADD:
            _check_add(line)
            continue
        item = sales_repo.get_item_by_id(session, line.target_order_item_id) if line.target_order_item_id else None
        if not item or item.sales_order_id != order.id or item.is_cancelled:
            raise HTTPException(status_code=422, detail="Una operación apunta a una partida que no está activa en la OV.")
        if item.id in targets:
            raise HTTPException(status_code=422, detail=f"{item.product_name} tiene más de una operación.")
        _check_target(session, item, line, require_dispositions)
        targets[item.id] = item
    return targets


# ---------------------------------------------------------------------------
# Storing the lines on the change order
# ---------------------------------------------------------------------------

def _final_quantity(item: SalesOrderItem, line: ChangeOrderLine) -> float:
    """Quantity changes carry the NEW quantity of the line; production cancellations derive it from the units."""
    if line.change_type == ChangeType.QUANTITY_DOWN and not item.is_resale:
        return float(item.quantity or 0.0) - len(set(line.cancel_instance_ids))
    return line.quantity


def _line_values(item: Optional[SalesOrderItem], line: ChangeOrderLine) -> tuple[str, float, float, float]:
    """(name, quantity, unit price, money delta without tax) of an operation as stored on the change order.
    For quantity changes the stored quantity is the new quantity of the line."""
    if line.change_type == ChangeType.ADD:
        return line.product_name.strip(), line.quantity, line.unit_price, line.quantity * line.unit_price
    price, qty = float(item.unit_price or 0.0), float(item.quantity or 0.0)
    if line.change_type in (ChangeType.QUANTITY_UP, ChangeType.QUANTITY_DOWN):
        final = _final_quantity(item, line)
        return item.product_name, final, price, (final - qty) * price
    if line.change_type == ChangeType.PRICE:
        return item.product_name, qty, line.unit_price, qty * (line.unit_price - price)
    return item.product_name, qty, price, -qty * price


def _snapshot(session: Session, item: Optional[SalesOrderItem], line: ChangeOrderLine) -> tuple[dict, float]:
    if line.change_type != ChangeType.ADD:
        return dict(item.cost_snapshot or {}), float(item.frozen_unit_cost or 0.0)
    return sales_service._build_item_snapshot(session, SalesOrderItemCreate(
        product_name=line.product_name, origin_version_id=line.origin_version_id, quantity=line.quantity,
        unit_price=line.unit_price, cost_snapshot=line.cost_snapshot, frozen_unit_cost=line.frozen_unit_cost,
        is_resale=line.is_resale, resale_sku=line.resale_sku,
    ))


def _store_lines(session: Session, change: Quotation, targets: Dict[int, SalesOrderItem], lines: List[ChangeOrderLine]) -> None:
    quotation_repo.deactivate_quotation_items(session, change.id)
    delta_sum = 0.0
    for line in lines:
        item = targets.get(line.target_order_item_id) if line.change_type != ChangeType.ADD else None
        name, qty, price, delta = _line_values(item, line)
        snapshot, frozen = _snapshot(session, item, line)
        delta_sum += delta
        session.add(QuotationItem(
            quotation_id=change.id, product_name=name, quantity=qty, unit_price=price, subtotal_price=round(delta, 2),
            origin_version_id=line.origin_version_id if item is None else item.origin_version_id,
            cost_snapshot=snapshot, frozen_unit_cost=frozen,
            is_resale=line.is_resale if item is None else item.is_resale,
            resale_sku=line.resale_sku if item is None else item.resale_sku,
            commercial_description=line.commercial_description if item is None else item.commercial_description,
            change_type=line.change_type, target_order_item_id=item.id if item else None,
            cancel_instance_ids=sorted(set(line.cancel_instance_ids)) or None,
            reversal_dispositions=dict(line.reversal_dispositions) or None,
            change_reason=(line.change_reason or "").strip() or None,
        ))
    session.flush()
    _set_totals(session, change, delta_sum)


def _set_totals(session: Session, change: Quotation, delta_sum: float) -> None:
    tax_rate = quotation_repo.get_tax_rate_by_id(session, change.tax_rate_id)
    commission = change.applied_commission_percent or 0.0
    change.subtotal = round(delta_sum, 2)
    change.commission_amount = margin_service.commission_amount(delta_sum, commission)
    change.tax_amount = round(delta_sum * (tax_rate.rate if tax_rate else 0.0), 2)
    change.total_price = round(change.subtotal + change.tax_amount, 2)


def _stored_lines(session: Session, change: Quotation) -> List[ChangeOrderLine]:
    return [
        ChangeOrderLine(
            change_type=row.change_type, target_order_item_id=row.target_order_item_id,
            product_name=row.product_name, origin_version_id=row.origin_version_id, quantity=row.quantity,
            unit_price=row.unit_price, cost_snapshot=row.cost_snapshot or {},
            frozen_unit_cost=row.frozen_unit_cost or 0.0, is_resale=row.is_resale, resale_sku=row.resale_sku,
            commercial_description=row.commercial_description, cancel_instance_ids=row.cancel_instance_ids or [],
            reversal_dispositions=row.reversal_dispositions or {}, change_reason=row.change_reason,
        )
        for row in quotation_repo.get_active_quotation_items(session, change.id)
    ]


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def create_change_order(session: Session, data: ChangeOrderCreate, current_user: User) -> QuotationRead:
    order = sales_service.get_order_for_line_edit(session, data.sales_order_id, current_user)
    assert_order_open(session, order)
    _assert_no_open_change(session, order.id)
    targets = validate_lines(session, order, data.lines, require_dispositions=False)
    change = Quotation(
        kind=QuotationKind.CHANGE_ORDER, parent_sales_order_id=order.id,
        change_number=quotation_repo.get_max_change_number(session, order.id) + 1,
        change_reason=data.change_reason.strip(), client_id=order.client_id, tax_rate_id=order.tax_rate_id,
        user_id=order.user_id or current_user.id, project_name=order.project_name, currency=order.currency,
        applied_commission_percent=order.applied_commission_percent or 0.0,
        applied_margin_percent=order.applied_margin_percent or 0.0,
        advance_percent=order.advance_percent if data.advance_percent is None else data.advance_percent,
        valid_until=datetime.utcnow() + timedelta(days=VALIDITY_DAYS), notes=data.notes,
        status=QuotationStatus.DRAFT, created_at=datetime.utcnow(),
    )
    session.add(change)
    session.flush()
    _store_lines(session, change, targets, seller_pricing_service.with_server_costs(session, data.lines, current_user))
    session.add(change)
    session.commit()
    return quotation_service.to_read(_get_change(session, change.id))


def update_change_order(session: Session, change_id: int, data: ChangeOrderUpdate, current_user: User) -> QuotationRead:
    change = _get_change_for_edit(session, change_id, current_user)
    if change.status not in quotation_service.EDITABLE_STATUSES:
        raise HTTPException(status_code=422, detail="Solo se editan órdenes de cambio en borrador o regresadas.")
    order = sales_repo.get_sales_order_by_id(session, change.parent_sales_order_id)
    if data.change_reason is not None:
        if not data.change_reason.strip():
            raise HTTPException(status_code=422, detail="El motivo es obligatorio.")
        change.change_reason = data.change_reason.strip()
    if data.advance_percent is not None:
        change.advance_percent = data.advance_percent
    if data.notes is not None:
        change.notes = data.notes
    if data.lines is not None:
        if not data.lines:
            raise HTTPException(status_code=422, detail="La orden de cambio necesita al menos una operación.")
        lines = seller_pricing_service.with_server_costs(session, data.lines, current_user, change.id)
        _store_lines(session, change, validate_lines(session, order, lines, False), lines)
    session.add(change)
    session.commit()
    return quotation_service.to_read(_get_change(session, change.id))


def authorize_change_order(session: Session, change_id: int, data: ChangeOrderAuthorize, current_user: User) -> QuotationRead:
    """Director: final prices, advance percent and the destination of material of units in production."""
    if _role(current_user) not in _AUTHORIZE_ROLES:
        raise HTTPException(status_code=403, detail="Solo Dirección autoriza órdenes de cambio.")
    change = _get_change(session, change_id)
    if change.status != QuotationStatus.PENDING_AUTH:
        raise HTTPException(status_code=422, detail="Solo se autorizan órdenes de cambio en revisión.")
    if quotation_service._is_overdue(change):
        raise HTTPException(status_code=422, detail="La vigencia ya venció; el vendedor debe renovarla.")
    order = sales_repo.get_sales_order_by_id(session, change.parent_sales_order_id)
    assert_order_open(session, order)
    targets = validate_lines(session, order, data.lines, require_dispositions=True)
    _store_lines(session, change, targets, data.lines)
    change.advance_percent = data.advance_percent
    change.director_notes = (data.director_notes or "").strip() or None
    change.status = QuotationStatus.AUTHORIZED
    change.authorized_at = datetime.utcnow()
    change.authorized_by_user_id = current_user.id
    session.add(change)
    session.commit()
    return quotation_service.to_read(_get_change(session, change.id))


def _return_for_changes(session: Session, change: Quotation, reason: str) -> None:
    with audit_reason(reason):
        change.status = QuotationStatus.CHANGES_REQUESTED
        change.changes_requested_at = datetime.utcnow()
        change.changes_requested_reason = reason
        session.add(change)
        session.commit()
    raise HTTPException(status_code=409, detail=reason)


def _guard_apply(session: Session, change: Quotation, order: SalesOrder, lines: List[ChangeOrderLine]) -> Dict[int, SalesOrderItem]:
    """The OV may have moved since the Director authorized: anything stale sends the change back."""
    if quotation_service._is_overdue(change):
        with audit_reason("Vigencia vencida"):
            change.status = QuotationStatus.EXPIRED
            change.expired_at = datetime.utcnow()
            session.add(change)
            session.commit()
        raise HTTPException(status_code=409, detail="La orden de cambio venció. Renuévala y vuelve a autorizarla.")
    try:
        assert_order_open(session, order)
        targets = validate_lines(session, order, lines, require_dispositions=True)
    except HTTPException as exc:
        _return_for_changes(session, change, f"La OV cambió desde la autorización: {exc.detail}")
    added = [row for row in quotation_repo.get_active_quotation_items(session, change.id) if row.change_type == ChangeType.ADD]
    analysis = CostEngine.analyze_items_drift(session, added) if added else {"is_safe": True}
    if not analysis["is_safe"]:
        _return_for_changes(session, change, f"SEMÁFORO ROJO: inflación de costos del {analysis['variation_percent']}% "
                            f"(tolerancia {analysis['tolerance_percent']}%). Requiere re-cotizar.")
    return targets


# ---------------------------------------------------------------------------
# Applying the change to the OV
# ---------------------------------------------------------------------------

def _next_unit_number(item: SalesOrderItem) -> int:
    numbers = [int(m.group(1)) for u in item.instances
               if (m := re.search(r"Instancia\s+(\d+)\s*$", u.custom_name or ""))]
    return max(numbers, default=0) + 1


def _add_units(session: Session, item: SalesOrderItem, count: int, change_id: int) -> None:
    start = _next_unit_number(item)
    for n in range(start, start + count):
        session.add(SalesOrderItemInstance(
            sales_order_item_id=item.id, custom_name=f"{item.product_name} - Instancia {n}",
            production_status=InstanceStatus.PENDING, change_quotation_id=change_id,
        ))


def _cancel_line(item: SalesOrderItem, user: User, reason: str) -> None:
    item.is_cancelled = True
    item.cancelled_at = datetime.utcnow()
    item.cancelled_by_user_id = user.id
    item.cancel_reason = reason


def _apply_add(session: Session, order: SalesOrder, line: ChangeOrderLine, change: Quotation) -> None:
    item = SalesOrderItem(
        sales_order_id=order.id, product_name=line.product_name.strip(), origin_version_id=line.origin_version_id,
        quantity=line.quantity, unit_price=line.unit_price, subtotal_price=line.quantity * line.unit_price,
        cost_snapshot=line.cost_snapshot, frozen_unit_cost=line.frozen_unit_cost, is_resale=line.is_resale,
        resale_sku=line.resale_sku, commercial_description=line.commercial_description,
        change_quotation_id=change.id,
    )
    session.add(item)
    session.flush()
    if not line.is_resale:
        _add_units(session, item, int(line.quantity), change.id)


def _apply_on_line(session: Session, item: SalesOrderItem, line: ChangeOrderLine, change: Quotation, user: User, reason: str) -> None:
    kind = line.change_type
    if kind == ChangeType.QUANTITY_UP:
        if not item.is_resale:
            _add_units(session, item, int(line.quantity - float(item.quantity or 0)), change.id)
        item.quantity = line.quantity
    elif kind == ChangeType.PRICE:
        item.unit_price = line.unit_price
    elif kind == ChangeType.QUANTITY_DOWN and item.is_resale:
        item.quantity = line.quantity
    else:
        units = _units_to_cancel(item, line)
        for unit in units:
            production_inventory_service.cancel_instance(
                session, unit, user, reason, line.reversal_dispositions.get(str(unit.id)))
        item.quantity = max(float(item.quantity or 0) - len(units), 0.0)
        if kind == ChangeType.CANCEL_LINE or item.quantity <= 0:
            _cancel_line(item, user, reason)
    item.subtotal_price = float(item.quantity or 0) * float(item.unit_price or 0)
    item.change_quotation_id = change.id
    session.add(item)


def _settle_order_status(order: SalesOrder) -> None:
    if order.status == SalesOrderStatus.FINISHED and order.outstanding_balance > 0.1:
        order.status = SalesOrderStatus.SOLD
    elif order.status == SalesOrderStatus.SOLD and order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED


def apply_change_order(session: Session, change_id: int, data: ChangeOrderApply, current_user: User) -> QuotationRead:
    change = _get_change_for_edit(session, change_id, current_user)
    if change.status != QuotationStatus.AUTHORIZED:
        raise HTTPException(status_code=422, detail="Solo se aplican órdenes de cambio autorizadas.")
    order = sales_repo.get_sales_order_by_id(session, change.parent_sales_order_id)
    lines = _stored_lines(session, change)
    targets = _guard_apply(session, change, order, lines)
    folio = quotation_service.quotation_folio(change)
    with audit_reason(f"Orden de cambio {folio}: {change.change_reason}"):
        for line in lines:
            line_reason = f"{folio}: {line.change_reason or change.change_reason}"
            if line.change_type == ChangeType.ADD:
                _apply_add(session, order, line, change)
            else:
                _apply_on_line(session, targets[line.target_order_item_id], line, change, current_user, line_reason)
        session.flush()
        sales_service.recalculate_order_totals(session, order)
        order.advance_percent = change.advance_percent
        change.complementary_advance_amount = sales_service.update_advance_requirement(session, order)
        _settle_order_status(order)
        change.status = QuotationStatus.APPLIED
        change.applied_at = datetime.utcnow()
        change.applied_by_user_id = current_user.id
        change.client_po_folio = (data.client_po_folio or "").strip() or None
        change.client_po_date = data.client_po_date.replace(tzinfo=None) if data.client_po_date else None
        session.add_all([order, change])
        session.commit()
    return quotation_service.to_read(_get_change(session, change.id))


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def list_change_orders(
    session: Session, current_user: User, sales_order_id: Optional[int] = None, status: Optional[QuotationStatus] = None
) -> List[QuotationRead]:
    quotation_service.expire_overdue_quotations(session)
    user_id = current_user.id if sales_service._is_seller_scoped_role(current_user) else None
    statuses = [status] if status else None
    return [quotation_service.to_read(c) for c in quotation_repo.get_change_orders(session, sales_order_id, statuses, user_id)]


def get_change_order(session: Session, change_id: int, current_user: User) -> QuotationRead:
    change = _get_change(session, change_id)
    if sales_service._is_seller_scoped_role(current_user) and change.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return quotation_service.to_read(change)
