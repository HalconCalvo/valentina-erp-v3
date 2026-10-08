"""Client credit notes and the money left open by change orders.

Invoices and credit notes are issued in Compaq; Valentina only captures them. A credit note linked to an
invoice lowers that invoice's balance; without an invoice it is a credit in favour of the client that is
applied to a later invoice. The order's own balance already moved when its total changed, so a credit note
never touches it. Nothing is deleted: a credit note is cancelled with a reason.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.sales import (
    CustomerCreditNote,
    CustomerCreditNoteStatus,
    CustomerPayment,
    CXCStatus,
    PaymentType,
    QuotationStatus,
    SalesOrder,
)
from app.models.users import User
from app.repositories import quotation_repository as quotation_repo
from app.repositories import sales_repository as sales_repo
from app.schemas.sales_schema import (
    CustomerCreditNoteApply,
    CustomerCreditNoteCancel,
    CustomerCreditNoteCreate,
    CustomerCreditNoteRead,
    OrderMoneySummaryRead,
    PendingComplementaryAdvance,
)
from app.services import sales_service

_FINANCE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
_SUMMARY_ROLES = _FINANCE_ROLES | {"SALES"}


def _require_finance(user: User) -> None:
    if sales_service._normalized_role(user) not in _FINANCE_ROLES:
        raise HTTPException(status_code=403, detail="Solo Dirección, Gerencia o Administración capturan notas de crédito.")


def _get_order(session: Session, order_id: int) -> SalesOrder:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order


def invoice_balance(session: Session, cxc: CustomerPayment) -> float:
    """What the client still owes on an invoice: amount minus advance amortized, payments and credit notes."""
    return round(
        float(cxc.amount or 0.0) - float(cxc.amortized_advance or 0.0)
        - sales_repo.sum_active_installments(session, cxc.id) - sales_repo.sum_active_credit_notes(session, cxc.id),
        2,
    )


def _get_invoice_with_balance(session: Session, order: SalesOrder, cxc_id: int, amount: float) -> CustomerPayment:
    cxc = sales_repo.get_cxc_by_id(session, cxc_id)
    if not cxc or cxc.sales_order_id != order.id or cxc.status == CXCStatus.CANCELLED:
        raise HTTPException(status_code=422, detail="La factura no es de esta OV o está cancelada.")
    if cxc.status == CXCStatus.PAID or invoice_balance(session, cxc) + 0.01 < amount:
        raise HTTPException(status_code=422, detail="La nota de crédito supera el saldo de la factura. "
                            "Captúrala sin factura: quedará como saldo a favor del cliente.")
    return cxc


def _settle_if_covered(session: Session, order: SalesOrder, cxc: CustomerPayment) -> None:
    """An invoice fully covered by payments and credit notes is settled; commission on what was collected."""
    if invoice_balance(session, cxc) > 0.01:
        return
    cxc.status = CXCStatus.PAID
    cxc.payment_date = cxc.payment_date or datetime.utcnow()
    collected = sales_repo.sum_active_installments(session, cxc.id)
    if not cxc.commission_paid and collected > 0.01:
        sales_service._add_cxc_commissions(session, order, cxc.id, collected,
                                           is_advance=cxc.payment_type == PaymentType.ADVANCE)
        cxc.commission_paid = True
    session.add(cxc)


def create_credit_note(
    session: Session, order_id: int, data: CustomerCreditNoteCreate, current_user: User
) -> CustomerCreditNoteRead:
    _require_finance(current_user)
    order = _get_order(session, order_id)
    sales_service.assert_change_order_of(session, order, data.change_quotation_id)
    cxc = _get_invoice_with_balance(session, order, data.customer_payment_id, data.amount) \
        if data.customer_payment_id else None
    reason = data.reason.strip()
    with audit_reason(reason):
        note = CustomerCreditNote(
            sales_order_id=order.id, customer_payment_id=data.customer_payment_id,
            change_quotation_id=data.change_quotation_id, folio=data.folio.strip(),
            note_date=data.note_date.replace(tzinfo=None), amount=round(data.amount, 2), reason=reason,
            created_by_user_id=current_user.id,
        )
        session.add(note)
        session.flush()
        if cxc:
            _settle_if_covered(session, order, cxc)
        session.commit()
    session.refresh(note)
    return CustomerCreditNoteRead.model_validate(note)


def _get_active_note(session: Session, note_id: int) -> CustomerCreditNote:
    note = sales_repo.get_credit_note_by_id(session, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    if note.status != CustomerCreditNoteStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="La nota de crédito está cancelada.")
    return note


def apply_credit_note(
    session: Session, note_id: int, data: CustomerCreditNoteApply, current_user: User
) -> CustomerCreditNoteRead:
    """A credit in favour of the client is applied to an invoice with balance."""
    _require_finance(current_user)
    note = _get_active_note(session, note_id)
    if note.customer_payment_id:
        raise HTTPException(status_code=409, detail="La nota de crédito ya está aplicada a una factura.")
    order = _get_order(session, note.sales_order_id)
    cxc = _get_invoice_with_balance(session, order, data.customer_payment_id, note.amount)
    with audit_reason(f"Aplicación de saldo a favor {note.folio}"):
        note.customer_payment_id = cxc.id
        session.add(note)
        session.flush()
        _settle_if_covered(session, order, cxc)
        session.commit()
    session.refresh(note)
    return CustomerCreditNoteRead.model_validate(note)


def cancel_credit_note(
    session: Session, note_id: int, data: CustomerCreditNoteCancel, current_user: User
) -> CustomerCreditNoteRead:
    _require_finance(current_user)
    note = _get_active_note(session, note_id)
    cxc = sales_repo.get_cxc_by_id(session, note.customer_payment_id) if note.customer_payment_id else None
    if cxc and cxc.status == CXCStatus.PAID:
        raise HTTPException(status_code=409, detail="La factura ya quedó saldada con esta nota de crédito; "
                            "no se puede cancelar desde aquí.")
    reason = data.cancel_reason.strip()
    with audit_reason(reason):
        note.status = CustomerCreditNoteStatus.CANCELLED
        note.cancel_reason = reason
        note.cancelled_at = datetime.utcnow()
        note.cancelled_by_user_id = current_user.id
        session.add(note)
        session.commit()
    session.refresh(note)
    return CustomerCreditNoteRead.model_validate(note)


def _complementary_advances(session: Session, order: SalesOrder, payments: list) -> List[PendingComplementaryAdvance]:
    rows = []
    for change in quotation_repo.get_change_orders(session, order.id, [QuotationStatus.APPLIED]):
        required = float(change.complementary_advance_amount or 0.0)
        linked = [p for p in payments if p.change_quotation_id == change.id and p.payment_type == PaymentType.ADVANCE]
        paid = sum(float(p.amount or 0.0) for p in linked if p.status == CXCStatus.PAID)
        if required > 0.01 and paid + 0.01 < required:
            rows.append(PendingComplementaryAdvance(
                change_quotation_id=change.id, folio=format_change_folio(order.id, change.change_number),
                amount=round(required, 2), invoiced=round(sum(float(p.amount or 0.0) for p in linked), 2),
                paid=round(paid, 2),
            ))
    return rows


def format_change_folio(order_id: int, number: Optional[int]) -> str:
    return f"CAM-{order_id:04d}-{number or 0}"


def get_money_summary(session: Session, order_id: int, current_user: User) -> OrderMoneySummaryRead:
    if sales_service._normalized_role(current_user) not in _SUMMARY_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos.")
    order = _get_order(session, order_id)
    if sales_service._is_seller_scoped_role(current_user) and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    payments = sales_repo.get_order_payments(session, order.id)
    notes = sales_repo.get_credit_notes_by_order(session, order.id)
    active = [n for n in notes if n.status == CustomerCreditNoteStatus.ACTIVE]
    invoiced = sum(float(p.amount or 0.0) - float(p.amortized_advance or 0.0) for p in payments)
    credited = sum(float(n.amount or 0.0) for n in active)
    return OrderMoneySummaryRead(
        total_price=round(float(order.total_price or 0.0), 2),
        invoiced_net=round(invoiced, 2),
        credit_notes_total=round(credited, 2),
        credit_note_pending=round(max(invoiced - credited - float(order.total_price or 0.0), 0.0), 2),
        unapplied_credit=round(sum(float(n.amount or 0.0) for n in active if not n.customer_payment_id), 2),
        advance_required=round(float(order.advance_invoice_amount or sales_service.required_advance(order)), 2),
        advance_invoiced=round(sum(float(p.amount or 0.0) for p in payments if p.payment_type == PaymentType.ADVANCE), 2),
        complementary_advances=_complementary_advances(session, order, payments),
        credit_notes=[CustomerCreditNoteRead.model_validate(n) for n in notes],
    )
