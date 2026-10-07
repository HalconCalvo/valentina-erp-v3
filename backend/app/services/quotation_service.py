"""Quotation domain — business logic (no direct HTTP, queries via repository).

Lifecycle: DRAFT -> PENDING_AUTH -> AUTHORIZED -> CONVERTED (sales order born in WAITING_ADVANCE).
Corrections: CHANGES_REQUESTED (Director returns it, or seller unlocks an authorized one) is editable again.
Endings: LOST (client said no), EXPIRED (validity passed), CANCELLED. Every change of state keeps who/when/why.
"""
from datetime import datetime, time
from io import BytesIO
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.core.business_time import local_to_utc_naive, today_local, utc_naive_to_local
from app.models.sales import (
    PaymentStatus,
    Quotation,
    QuotationItem,
    QuotationStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderStatus,
)
from app.models.users import User
from app.repositories import quotation_repository as quotation_repo
from app.repositories import sales_repository as sales_repo
from app.schemas.quotation_schema import (
    QuotationAuthorize,
    QuotationCancel,
    QuotationConvert,
    QuotationConvertRead,
    QuotationCreate,
    QuotationItemCreate,
    QuotationItemRead,
    QuotationRead,
    QuotationReason,
    QuotationRenew,
    QuotationUpdate,
)
from app.schemas.sales_schema import SalesOrderItemCreate
from app.services.cost_engine import CostEngine
from app.services.pdf_generator import PDFGenerator
from app.services.sales_service import (
    _build_item_snapshot,
    _is_seller_scoped_role,
    _normalized_role,
    create_instances_for_order,
    normalize_commission,
)

_EDIT_ROLES = {"DIRECTOR", "MANAGER", "SALES"}
_AUTHORIZE_ROLES = {"DIRECTOR"}
EDITABLE_STATUSES = {QuotationStatus.DRAFT, QuotationStatus.CHANGES_REQUESTED}
EXPIRABLE_STATUSES = {QuotationStatus.PENDING_AUTH, QuotationStatus.AUTHORIZED}
CANCELLABLE_STATUSES = EDITABLE_STATUSES | EXPIRABLE_STATUSES
LOSABLE_STATUSES = EXPIRABLE_STATUSES | {QuotationStatus.EXPIRED}
# Text fields the seller may still adjust on an authorized quotation (they do not change the price).
AUTHORIZED_TEXT_FIELDS = {"notes", "conditions"}


def format_folio(quotation_id: int) -> str:
    return f"COT-{quotation_id:04d}"


def _to_read(quotation: Quotation) -> QuotationRead:
    """Response without the logically cancelled items (the ORM collection itself is never mutated)."""
    data = QuotationRead.model_validate(quotation)
    data.items = [QuotationItemRead.model_validate(i) for i in quotation.items if not i.is_cancelled]
    data.folio = format_folio(quotation.id)
    return data


def _get_or_404(session: Session, quotation_id: int) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    return quotation


def _assert_scope(user: User, quotation: Quotation) -> None:
    if _is_seller_scoped_role(user) and quotation.user_id != user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")


def _get_for_edit(session: Session, quotation_id: int, user: User) -> Quotation:
    if _normalized_role(user) not in _EDIT_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para gestionar cotizaciones.")
    quotation = _get_or_404(session, quotation_id)
    _assert_scope(user, quotation)
    return quotation


def _assert_status(quotation: Quotation, allowed: set, message: str) -> None:
    if quotation.status not in allowed:
        raise HTTPException(status_code=422, detail=message)


def _clean_reason(reason: Optional[str]) -> str:
    text = (reason or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio.")
    return text


def _start_of_today_utc() -> datetime:
    return local_to_utc_naive(datetime.combine(today_local(), time.min))


def _is_overdue(quotation: Quotation) -> bool:
    return bool(quotation.valid_until) and quotation.valid_until < _start_of_today_utc()


def _commit_read(session: Session, quotation: Quotation) -> QuotationRead:
    session.add(quotation)
    session.commit()
    return _to_read(_get_or_404(session, quotation.id))


def _persist_quotation_item(
    session: Session, quotation_id: int, item_in: QuotationItemCreate, snapshot: dict, frozen_cost: float
) -> QuotationItem:
    db_item = QuotationItem(
        quotation_id=quotation_id,
        product_name=item_in.product_name,
        origin_version_id=item_in.origin_version_id,
        quantity=item_in.quantity,
        unit_price=item_in.unit_price,
        subtotal_price=item_in.quantity * item_in.unit_price,
        cost_snapshot=snapshot,
        frozen_unit_cost=frozen_cost,
        is_resale=item_in.is_resale,
        resale_sku=item_in.resale_sku,
        commercial_description=item_in.commercial_description,
    )
    session.add(db_item)
    return db_item


def _apply_items_and_totals(session: Session, quotation: Quotation, items: List[QuotationItemCreate]) -> None:
    """Replaces the active items (old ones are cancelled logically) and recomputes the totals."""
    quotation_repo.deactivate_quotation_items(session, quotation.id)
    items_sum = 0.0
    for item_in in items:
        payload = SalesOrderItemCreate.model_validate(item_in.model_dump())
        snapshot, frozen_cost = _build_item_snapshot(session, payload)
        items_sum += item_in.quantity * item_in.unit_price
        _persist_quotation_item(session, quotation.id, item_in, snapshot, frozen_cost)
    session.flush()
    tax_rate = quotation_repo.get_tax_rate_by_id(session, quotation.tax_rate_id)
    commission = quotation.applied_commission_percent or 0.0
    quotation.commission_amount = items_sum - (items_sum / (1 + commission)) if commission > 0 else 0.0
    quotation.subtotal = items_sum
    quotation.tax_amount = items_sum * (tax_rate.rate if tax_rate else 0.0)
    quotation.total_price = items_sum + quotation.tax_amount


def create_quotation(session: Session, data: QuotationCreate, current_user: User) -> QuotationRead:
    if _normalized_role(current_user) not in _EDIT_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para crear cotizaciones.")
    if not quotation_repo.get_tax_rate_by_id(session, data.tax_rate_id):
        raise HTTPException(status_code=400, detail="Tasa de impuestos inválida")
    raw_commission = data.applied_commission_percent or current_user.commission_rate or 0.0
    header = data.model_dump(exclude={"items", "applied_commission_percent"})
    quotation = Quotation(
        **header,
        user_id=current_user.id,
        applied_commission_percent=normalize_commission(raw_commission),
        status=QuotationStatus.DRAFT,
        created_at=datetime.utcnow(),
    )
    session.add(quotation)
    session.flush()
    if data.items:
        _apply_items_and_totals(session, quotation, data.items)
    return _commit_read(session, quotation)


def expire_overdue_quotations(session: Session) -> int:
    """Marks as EXPIRED the quotations waiting for the Director or the client whose validity already passed."""
    overdue = quotation_repo.get_overdue_quotations(session, EXPIRABLE_STATUSES, _start_of_today_utc())
    if not overdue:
        return 0
    with audit_reason("Vigencia vencida"):
        for quotation in overdue:
            quotation.status = QuotationStatus.EXPIRED
            quotation.expired_at = datetime.utcnow()
            session.add(quotation)
        session.commit()
    return len(overdue)


def list_quotations(
    session: Session,
    current_user: User,
    status: Optional[QuotationStatus] = None,
    skip: int = 0,
    limit: int = 1000,
) -> List[QuotationRead]:
    expire_overdue_quotations(session)
    user_id = current_user.id if _is_seller_scoped_role(current_user) else None
    rows = quotation_repo.get_quotations(session, status=status, user_id=user_id, skip=skip, limit=limit)
    return [_to_read(q) for q in rows]


def get_quotation(session: Session, quotation_id: int, current_user: User) -> QuotationRead:
    quotation = _get_or_404(session, quotation_id)
    _assert_scope(current_user, quotation)
    return _to_read(quotation)


def update_quotation(
    session: Session, quotation_id: int, data: QuotationUpdate, current_user: User
) -> QuotationRead:
    quotation = _get_for_edit(session, quotation_id, current_user)
    update_data = data.model_dump(exclude_unset=True)
    if quotation.status == QuotationStatus.AUTHORIZED and set(update_data) <= AUTHORIZED_TEXT_FIELDS:
        for key, value in update_data.items():
            setattr(quotation, key, value)
        return _commit_read(session, quotation)
    _assert_status(quotation, EDITABLE_STATUSES,
                   "Solo se editan cotizaciones en borrador o regresadas para cambios.")
    items_data = update_data.pop("items", None)
    for key, value in update_data.items():
        setattr(quotation, key, value)
    if "applied_commission_percent" in update_data:
        quotation.applied_commission_percent = normalize_commission(update_data["applied_commission_percent"])
    if items_data is not None:
        _apply_items_and_totals(session, quotation, data.items)
    return _commit_read(session, quotation)


def request_authorization(session: Session, quotation_id: int, current_user: User) -> QuotationRead:
    quotation = _get_for_edit(session, quotation_id, current_user)
    _assert_status(quotation, EDITABLE_STATUSES,
                   "Solo se solicita autorización de cotizaciones en borrador o con cambios.")
    if not quotation_repo.get_active_quotation_items(session, quotation_id):
        raise HTTPException(status_code=422, detail="La cotización debe tener al menos una partida.")
    if _is_overdue(quotation):
        raise HTTPException(status_code=422, detail="La vigencia ya venció; actualízala antes de solicitar autorización.")
    quotation.status = QuotationStatus.PENDING_AUTH
    quotation.auth_requested_at = datetime.utcnow()
    return _commit_read(session, quotation)


def authorize_quotation(
    session: Session, quotation_id: int, data: QuotationAuthorize, current_user: User
) -> QuotationRead:
    if _normalized_role(current_user) not in _AUTHORIZE_ROLES:
        raise HTTPException(status_code=403, detail="Solo Dirección autoriza cotizaciones.")
    quotation = _get_or_404(session, quotation_id)
    _assert_status(quotation, {QuotationStatus.PENDING_AUTH}, "Solo se autorizan cotizaciones en revisión.")
    if _is_overdue(quotation):
        raise HTTPException(status_code=422, detail="La vigencia ya venció; el vendedor debe renovarla.")
    quotation.applied_margin_percent = data.applied_margin_percent
    quotation.applied_commission_percent = normalize_commission(data.applied_commission_percent)
    quotation.advance_percent = data.advance_percent
    quotation.advance_invoice_amount = data.advance_invoice_amount
    quotation.director_notes = (data.director_notes or "").strip() or None
    _apply_items_and_totals(session, quotation, data.items)
    quotation.status = QuotationStatus.AUTHORIZED
    quotation.authorized_at = datetime.utcnow()
    quotation.authorized_by_user_id = current_user.id
    return _commit_read(session, quotation)


def request_changes(
    session: Session, quotation_id: int, data: QuotationReason, current_user: User
) -> QuotationRead:
    """Director returns a quotation under review, or the seller unlocks an authorized one to edit it."""
    reason = _clean_reason(data.reason)
    quotation = _get_for_edit(session, quotation_id, current_user)
    if quotation.status == QuotationStatus.PENDING_AUTH and _normalized_role(current_user) not in _AUTHORIZE_ROLES:
        raise HTTPException(status_code=403, detail="Solo Dirección regresa cotizaciones en revisión.")
    _assert_status(quotation, EXPIRABLE_STATUSES, "Solo se regresan cotizaciones en revisión o autorizadas.")
    with audit_reason(reason):
        quotation.status = QuotationStatus.CHANGES_REQUESTED
        quotation.changes_requested_at = datetime.utcnow()
        quotation.changes_requested_reason = reason
        quotation.changes_requested_by_user_id = current_user.id
        return _commit_read(session, quotation)


def mark_lost(session: Session, quotation_id: int, data: QuotationReason, current_user: User) -> QuotationRead:
    reason = _clean_reason(data.reason)
    quotation = _get_for_edit(session, quotation_id, current_user)
    _assert_status(quotation, LOSABLE_STATUSES, "Solo se marcan como perdidas cotizaciones en curso o vencidas.")
    with audit_reason(reason):
        quotation.status = QuotationStatus.LOST
        quotation.lost_at = datetime.utcnow()
        quotation.lost_reason = reason
        return _commit_read(session, quotation)


def cancel_quotation(
    session: Session, quotation_id: int, data: QuotationCancel, current_user: User
) -> QuotationRead:
    reason = _clean_reason(data.cancel_reason)
    quotation = _get_for_edit(session, quotation_id, current_user)
    _assert_status(quotation, CANCELLABLE_STATUSES, "No se puede cancelar una cotización en este estado.")
    with audit_reason(reason):
        quotation.status = QuotationStatus.CANCELLED
        quotation.cancel_reason = reason
        quotation.cancelled_at = datetime.utcnow()
        quotation.cancelled_by_user_id = current_user.id
        return _commit_read(session, quotation)


def renew_quotation(session: Session, quotation_id: int, data: QuotationRenew, current_user: User) -> QuotationRead:
    """An expired quotation gets a new validity date and goes back to draft (it must be authorized again)."""
    quotation = _get_for_edit(session, quotation_id, current_user)
    _assert_status(quotation, {QuotationStatus.EXPIRED}, "Solo se renuevan cotizaciones vencidas.")
    if utc_naive_to_local(data.valid_until.replace(tzinfo=None)).date() < today_local():
        raise HTTPException(status_code=422, detail="La nueva vigencia debe ser hoy o una fecha futura.")
    with audit_reason("Renovación de vigencia"):
        quotation.valid_until = data.valid_until.replace(tzinfo=None)
        quotation.status = QuotationStatus.DRAFT
        return _commit_read(session, quotation)


def _guard_conversion(session: Session, quotation: Quotation, active_items: list) -> None:
    """Expired validity or cost inflation above tolerance stop the conversion (state change is kept)."""
    if _is_overdue(quotation):
        with audit_reason("Vigencia vencida"):
            quotation.status = QuotationStatus.EXPIRED
            quotation.expired_at = datetime.utcnow()
            session.add(quotation)
            session.commit()
        raise HTTPException(status_code=409, detail="La cotización venció. Renueva la vigencia y vuelve a autorizarla.")
    analysis = CostEngine.analyze_items_drift(session, active_items)
    if analysis["is_safe"]:
        return
    reason = (f"SEMÁFORO ROJO: inflación de costos del {analysis['variation_percent']}% "
              f"(tolerancia {analysis['tolerance_percent']}%). Requiere re-cotizar.")
    with audit_reason(reason):
        quotation.status = QuotationStatus.CHANGES_REQUESTED
        quotation.changes_requested_at = datetime.utcnow()
        quotation.changes_requested_reason = reason
        session.add(quotation)
        session.commit()
    raise HTTPException(status_code=409, detail=reason)


_ORDER_FIELDS_FROM_QUOTATION = [
    "project_name", "client_id", "tax_rate_id", "user_id", "applied_commission_percent", "valid_until",
    "delivery_date", "applied_margin_percent", "applied_tolerance_percent", "advance_percent",
    "has_advance_invoice", "advance_invoice_amount", "currency", "notes", "conditions", "external_invoice_ref",
    "is_warranty", "exchange_rate", "estimated_installation_cost", "estimated_manufacturing_cost", "subtotal",
    "tax_amount", "total_price", "commission_amount",
]
_ITEM_FIELDS_FROM_QUOTATION = [
    "product_name", "origin_version_id", "quantity", "unit_price", "subtotal_price", "cost_snapshot",
    "frozen_unit_cost", "is_resale", "resale_sku", "commercial_description",
]


def _create_order(session: Session, quotation: Quotation, active_items: list, data: QuotationConvert) -> SalesOrder:
    order = SalesOrder(
        **{f: getattr(quotation, f) for f in _ORDER_FIELDS_FROM_QUOTATION},
        quotation_id=quotation.id,
        outstanding_balance=quotation.total_price,
        payment_status=PaymentStatus.PENDING,
        status=SalesOrderStatus.WAITING_ADVANCE,
        client_po_folio=data.client_po_folio.strip(),
        client_po_date=data.client_po_date.replace(tzinfo=None),
        is_approved_by_director=True,
        director_approved_at=quotation.authorized_at,
        created_at=datetime.utcnow(),
    )
    session.add(order)
    session.flush()
    for q_item in active_items:
        session.add(SalesOrderItem(sales_order_id=order.id,
                                   **{f: getattr(q_item, f) for f in _ITEM_FIELDS_FROM_QUOTATION}))
    session.flush()
    create_instances_for_order(session, sales_repo.get_order_by_id(session, order.id))
    return order


def convert_quotation_to_order(
    session: Session, quotation_id: int, data: QuotationConvert, current_user: User
) -> QuotationConvertRead:
    quotation = _get_for_edit(session, quotation_id, current_user)
    _assert_status(quotation, {QuotationStatus.AUTHORIZED}, "Solo se convierten cotizaciones autorizadas.")
    if quotation.sales_order_id:
        raise HTTPException(status_code=409, detail="Esta cotización ya fue convertida en orden de venta.")
    if not data.client_po_folio.strip():
        raise HTTPException(status_code=422, detail="El folio de la OC del cliente es obligatorio.")
    active_items = quotation_repo.get_active_quotation_items(session, quotation_id)
    if not active_items:
        raise HTTPException(status_code=422, detail="La cotización no tiene partidas activas.")
    _guard_conversion(session, quotation, active_items)
    order = _create_order(session, quotation, active_items, data)
    quotation.sales_order_id = order.id
    quotation.status = QuotationStatus.CONVERTED
    quotation.converted_at = datetime.utcnow()
    session.add(quotation)
    session.commit()
    return QuotationConvertRead(
        quotation_id=quotation.id,
        sales_order_id=order.id,
        message=f"{format_folio(quotation.id)} convertida en OV-{order.id:04d}",
    )


def generate_quotation_pdf(session: Session, quotation_id: int, current_user: User) -> tuple[BytesIO, str]:
    quotation = _get_or_404(session, quotation_id)
    _assert_scope(current_user, quotation)
    data = _to_read(quotation)
    client = quotation_repo.get_client_by_id(session, quotation.client_id)
    config = quotation_repo.get_global_config(session)
    seller = quotation_repo.get_user_by_id(session, quotation.user_id) if quotation.user_id else None
    pdf_buffer = PDFGenerator().generate_quote_pdf(
        order=data,
        client=client,
        config=config,
        seller_name=seller.full_name if seller else "Departamento de Ventas",
        seller_email=seller.email if seller else "",
        seller_phone=seller.phone if seller and seller.phone else "",
        folio=data.folio,
    )
    return pdf_buffer, f"{data.folio}.pdf"
