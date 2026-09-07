"""Quotation domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

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
from app.schemas.quotation_schema import (
    QuotationCancel,
    QuotationConvertRead,
    QuotationCreate,
    QuotationItemCreate,
    QuotationReject,
    QuotationUpdate,
)
from app.schemas.sales_schema import SalesOrderItemCreate
from app.services.sales_service import (
    _build_item_snapshot,
    _is_seller_scoped_role,
    _normalized_role,
    normalize_commission,
)

_CREATE_ROLES = {"DIRECTOR", "MANAGER", "SALES"}
_EDIT_ROLES = _CREATE_ROLES


def _assert_can_create(user: User) -> None:
    if _normalized_role(user) not in _CREATE_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para crear cotizaciones.")


def _assert_can_edit(user: User, quotation: Quotation) -> None:
    if _normalized_role(user) not in _EDIT_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar cotizaciones.")
    if _is_seller_scoped_role(user) and quotation.user_id != user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")


def _filter_active_items(quotation: Quotation) -> Quotation:
    quotation.items = [i for i in quotation.items if not i.is_cancelled]
    return quotation


def _persist_quotation_item(
    session: Session,
    quotation_id: int,
    item_in: QuotationItemCreate,
    snapshot_data: dict,
    calculated_frozen_cost: float,
    line_amount: float,
) -> QuotationItem:
    db_item = QuotationItem(
        quotation_id=quotation_id,
        product_name=item_in.product_name,
        origin_version_id=item_in.origin_version_id,
        quantity=item_in.quantity,
        unit_price=item_in.unit_price,
        subtotal_price=line_amount,
        cost_snapshot=snapshot_data,
        frozen_unit_cost=calculated_frozen_cost,
        is_resale=getattr(item_in, "is_resale", False),
        resale_sku=getattr(item_in, "resale_sku", None),
        commercial_description=getattr(item_in, "commercial_description", None),
    )
    session.add(db_item)
    return db_item


def _apply_items_and_totals(
    session: Session,
    quotation: Quotation,
    items: List[QuotationItemCreate],
    tax_rate_value: float,
    applied_commission: float,
) -> None:
    items_sum = 0.0
    for item_in in items:
        item_payload = SalesOrderItemCreate.model_validate(item_in.model_dump())
        snapshot_data, calculated_frozen_cost = _build_item_snapshot(session, item_payload)
        line_amount = item_in.quantity * item_in.unit_price
        items_sum += line_amount
        _persist_quotation_item(
            session, quotation.id, item_in, snapshot_data, calculated_frozen_cost, line_amount
        )
        session.flush()
    commission_amount = items_sum - (items_sum / (1 + applied_commission)) if applied_commission > 0 else 0.0
    quotation.commission_amount = commission_amount
    quotation.subtotal = items_sum
    quotation.tax_amount = items_sum * tax_rate_value
    quotation.total_price = items_sum + quotation.tax_amount


def create_quotation(session: Session, data: QuotationCreate, current_user: User) -> Quotation:
    _assert_can_create(current_user)
    tax_rate = quotation_repo.get_tax_rate_by_id(session, data.tax_rate_id)
    if not tax_rate:
        raise HTTPException(status_code=400, detail="Tasa de impuestos inválida")
    raw_commission = (
        data.applied_commission_percent
        if data.applied_commission_percent
        else (current_user.commission_rate if current_user.commission_rate is not None else 0.0)
    )
    applied_commission = normalize_commission(raw_commission)
    db_quotation = Quotation(
        project_name=data.project_name,
        client_id=data.client_id,
        tax_rate_id=data.tax_rate_id,
        user_id=current_user.id,
        applied_commission_percent=applied_commission,
        valid_until=data.valid_until,
        delivery_date=data.delivery_date,
        applied_margin_percent=data.applied_margin_percent,
        applied_tolerance_percent=data.applied_tolerance_percent,
        advance_percent=data.advance_percent,
        has_advance_invoice=data.has_advance_invoice,
        advance_invoice_amount=data.advance_invoice_amount,
        currency=data.currency,
        notes=data.notes,
        conditions=data.conditions,
        external_invoice_ref=data.external_invoice_ref,
        is_warranty=data.is_warranty,
        status=QuotationStatus.DRAFT,
        created_at=datetime.utcnow(),
    )
    session.add(db_quotation)
    session.commit()
    session.refresh(db_quotation)
    if data.items:
        _apply_items_and_totals(session, db_quotation, data.items, tax_rate.rate, applied_commission)
        session.add(db_quotation)
        session.commit()
    quotation = quotation_repo.get_quotation_by_id(session, db_quotation.id)
    return _filter_active_items(quotation)


def list_quotations(
    session: Session,
    current_user: User,
    status: Optional[QuotationStatus] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Quotation]:
    user_id = current_user.id if _is_seller_scoped_role(current_user) else None
    rows = quotation_repo.get_quotations(session, status=status, user_id=user_id, skip=skip, limit=limit)
    return [_filter_active_items(q) for q in rows]


def get_quotation(session: Session, quotation_id: int, current_user: User) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    if _is_seller_scoped_role(current_user) and quotation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return _filter_active_items(quotation)


def update_quotation(
    session: Session, quotation_id: int, data: QuotationUpdate, current_user: User
) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status != QuotationStatus.DRAFT:
        raise HTTPException(status_code=422, detail="Solo se pueden editar cotizaciones en borrador")
    update_data = data.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    for key, value in update_data.items():
        setattr(quotation, key, value)
    if "applied_commission_percent" in update_data:
        quotation.applied_commission_percent = normalize_commission(update_data["applied_commission_percent"])
    tax_rate = quotation_repo.get_tax_rate_by_id(session, quotation.tax_rate_id)
    if items_data is not None:
        quotation_repo.deactivate_quotation_items(session, quotation_id)
        _apply_items_and_totals(
            session,
            quotation,
            items_data,
            tax_rate.rate if tax_rate else 0.16,
            quotation.applied_commission_percent or 0.0,
        )
    session.add(quotation)
    session.commit()
    refreshed = quotation_repo.get_quotation_by_id(session, quotation_id)
    return _filter_active_items(refreshed)


def send_quotation(session: Session, quotation_id: int, current_user: User) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status != QuotationStatus.DRAFT:
        raise HTTPException(status_code=422, detail="Solo se pueden enviar cotizaciones en borrador")
    if not quotation_repo.get_active_quotation_items(session, quotation_id):
        raise HTTPException(status_code=400, detail="La cotización debe tener al menos una partida")
    quotation.status = QuotationStatus.SENT
    quotation.sent_at = datetime.utcnow()
    session.add(quotation)
    session.commit()
    session.refresh(quotation)
    return _filter_active_items(quotation)


def accept_quotation(session: Session, quotation_id: int, current_user: User) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status != QuotationStatus.SENT:
        raise HTTPException(status_code=422, detail="Solo se pueden aceptar cotizaciones enviadas")
    quotation.status = QuotationStatus.ACCEPTED
    quotation.accepted_at = datetime.utcnow()
    session.add(quotation)
    session.commit()
    session.refresh(quotation)
    return _filter_active_items(quotation)


def reject_quotation(
    session: Session, quotation_id: int, data: QuotationReject, current_user: User
) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status != QuotationStatus.SENT:
        raise HTTPException(status_code=422, detail="Solo se pueden rechazar cotizaciones enviadas")
    reason = (data.reject_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="Debes indicar el motivo de rechazo")
    quotation.status = QuotationStatus.REJECTED
    quotation.rejected_at = datetime.utcnow()
    quotation.reject_reason = reason
    quotation.rejected_by_user_id = current_user.id
    session.add(quotation)
    session.commit()
    session.refresh(quotation)
    return _filter_active_items(quotation)


def cancel_quotation(
    session: Session, quotation_id: int, data: QuotationCancel, current_user: User
) -> Quotation:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status not in (QuotationStatus.DRAFT, QuotationStatus.SENT):
        raise HTTPException(status_code=422, detail="No se puede cancelar una cotización en este estado")
    reason = (data.cancel_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="Debes indicar el motivo de cancelación")
    quotation.status = QuotationStatus.CANCELLED
    quotation.cancel_reason = reason
    quotation.cancelled_at = datetime.utcnow()
    quotation.cancelled_by_user_id = current_user.id
    session.add(quotation)
    session.commit()
    session.refresh(quotation)
    return _filter_active_items(quotation)


def convert_quotation_to_order(
    session: Session, quotation_id: int, current_user: User
) -> QuotationConvertRead:
    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    _assert_can_edit(current_user, quotation)
    if quotation.status != QuotationStatus.ACCEPTED:
        raise HTTPException(status_code=422, detail="Solo se pueden convertir cotizaciones aceptadas")
    if quotation.sales_order_id:
        raise HTTPException(status_code=409, detail="Esta cotización ya fue convertida en orden de venta")
    active_items = quotation_repo.get_active_quotation_items(session, quotation_id)
    if not active_items:
        raise HTTPException(status_code=400, detail="La cotización no tiene partidas activas")
    order = SalesOrder(
        quotation_id=quotation.id,
        project_name=quotation.project_name,
        client_id=quotation.client_id,
        tax_rate_id=quotation.tax_rate_id,
        user_id=quotation.user_id,
        applied_commission_percent=quotation.applied_commission_percent,
        valid_until=quotation.valid_until,
        delivery_date=quotation.delivery_date,
        applied_margin_percent=quotation.applied_margin_percent,
        applied_tolerance_percent=quotation.applied_tolerance_percent,
        advance_percent=quotation.advance_percent,
        has_advance_invoice=quotation.has_advance_invoice,
        advance_invoice_amount=quotation.advance_invoice_amount,
        currency=quotation.currency,
        notes=quotation.notes,
        conditions=quotation.conditions,
        external_invoice_ref=quotation.external_invoice_ref,
        is_warranty=quotation.is_warranty,
        exchange_rate=quotation.exchange_rate,
        estimated_installation_cost=quotation.estimated_installation_cost,
        estimated_manufacturing_cost=quotation.estimated_manufacturing_cost,
        subtotal=quotation.subtotal,
        tax_amount=quotation.tax_amount,
        total_price=quotation.total_price,
        commission_amount=quotation.commission_amount,
        outstanding_balance=quotation.total_price,
        payment_status=PaymentStatus.PENDING,
        status=SalesOrderStatus.ACCEPTED,
        created_at=datetime.utcnow(),
    )
    session.add(order)
    session.flush()
    for q_item in active_items:
        session.add(SalesOrderItem(
            sales_order_id=order.id,
            product_name=q_item.product_name,
            origin_version_id=q_item.origin_version_id,
            quantity=q_item.quantity,
            unit_price=q_item.unit_price,
            subtotal_price=q_item.subtotal_price,
            cost_snapshot=q_item.cost_snapshot,
            frozen_unit_cost=q_item.frozen_unit_cost,
            is_resale=q_item.is_resale,
            resale_sku=q_item.resale_sku,
            commercial_description=q_item.commercial_description,
        ))
    quotation.sales_order_id = order.id
    session.add(quotation)
    session.commit()
    session.refresh(order)
    return QuotationConvertRead(
        quotation_id=quotation.id,
        sales_order_id=order.id,
        message=f"Cotización #{quotation.id} convertida en OV #{order.id}",
    )


def generate_quotation_pdf(session: Session, quotation_id: int):
    from fastapi.responses import StreamingResponse

    from app.services.pdf_generator import PDFGenerator

    quotation = quotation_repo.get_quotation_by_id(session, quotation_id)
    if not quotation:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    quotation = _filter_active_items(quotation)
    client = quotation_repo.get_client_by_id(session, quotation.client_id)
    config = quotation_repo.get_global_config(session)
    seller = quotation_repo.get_user_by_id(session, quotation.user_id) if quotation.user_id else None
    seller_name = seller.full_name if seller else "Departamento de Ventas"
    seller_email = seller.email if seller else ""
    seller_phone = seller.phone if seller and seller.phone else ""
    pdf_buffer = PDFGenerator().generate_quote_pdf(
        order=quotation,
        client=client,
        config=config,
        seller_name=seller_name,
        seller_email=seller_email,
        seller_phone=seller_phone,
    )
    filename = f"Cotizacion_{quotation.id}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
