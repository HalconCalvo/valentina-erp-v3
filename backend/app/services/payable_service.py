"""Accounts payable (accounts_payable) and their purchase invoices, written through the ORM so every change
reaches the change log. Nothing is deleted: a payable that drops to zero is cancelled with its reason.
"""
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.core.permissions import require_roles
from app.models.finance import InvoiceStatus, PaymentStatus, SupplierPayment
from app.repositories import purchase_repository as purchase_repo
from app.schemas.finance_schema import PaymentRequestCancel

PAYABLE_PENDING = "PENDIENTE"
PAYABLE_PAID = "PAGADO"
PAYABLE_CANCELLED = "CANCELADO"
ZERO_TOLERANCE = 0.01


def set_status_by_folio(session: Session, folio: str, status: str, provider_id: Optional[int] = None) -> None:
    """Marks the payables of an invoice folio (optionally of one provider) as paid or cancelled."""
    for payable in purchase_repo.get_payables_by_folio(session, folio, provider_id):
        if payable.status != status:
            payable.status = status
            session.add(payable)
    session.flush()


def _cancel_payable(session: Session, payable, note: str) -> None:
    payable.status = PAYABLE_CANCELLED
    payable.notes = "; ".join(x for x in (payable.notes, note) if x)
    session.add(payable)
    for invoice in purchase_repo.get_invoices_by_payable(session, payable.id):
        invoice.status = InvoiceStatus.CANCELLED
        invoice.outstanding_balance = 0
        session.add(invoice)


def _set_amounts(session: Session, payable, subtotal: float, tax: float, total: float) -> None:
    payable.subtotal, payable.tax_amount, payable.total_amount = subtotal, tax, total
    payable.status = PAYABLE_PENDING
    session.add(payable)
    for invoice in purchase_repo.get_invoices_by_payable(session, payable.id):
        reduction = float(invoice.total_amount or 0) - total
        invoice.outstanding_balance = round(max(float(invoice.outstanding_balance or 0) - reduction, 0.0), 2)
        invoice.subtotal, invoice.tax_amount, invoice.total_amount = subtotal, tax, total
        session.add(invoice)


def reduce_for_reception_correction(session: Session, payable_id: int, amount: float, reason: str) -> bool:
    """Takes `amount` (without tax) off a payable and its invoice after a reception correction.

    If the total reaches zero the payable and its invoice are cancelled (their folio is free to be received
    again). Returns False when the payable does not exist.
    """
    payable = purchase_repo.get_payable(session, payable_id)
    if payable is None:
        return False
    rate = float(payable.tax_rate if payable.tax_rate is not None else 0.16)  # 0% (exempt) stays 0%
    new_subtotal = max(float(payable.subtotal or 0) - amount, 0.0)
    new_tax = round(new_subtotal * rate, 2)
    new_total = round(new_subtotal + new_tax, 2)
    with audit_reason(reason):
        if new_total <= ZERO_TOLERANCE:
            _cancel_payable(session, payable, reason)
        else:
            _set_amounts(session, payable, round(new_subtotal, 2), new_tax, new_total)
        session.flush()
    return True


PAYMENT_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
CANCELLABLE_PAYMENT_STATUSES = {PaymentStatus.PENDING, PaymentStatus.REJECTED}


def cancel_payment_request(session: Session, payment_id: int, data: PaymentRequestCancel, user) -> SupplierPayment:
    """A pending or rejected payment request is cancelled with its reason (it was deleted before)."""
    require_roles(user, PAYMENT_ROLES, "Solo Dirección, Gerencia o Administración cancelan solicitudes de pago.")
    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="El motivo de la cancelación es obligatorio.")
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if payment.status not in CANCELLABLE_PAYMENT_STATUSES:
        raise HTTPException(status_code=400, detail="No se puede cancelar una solicitud ya autorizada o pagada")
    with audit_reason(reason):
        payment.status = PaymentStatus.CANCELLED
        payment.notes = "; ".join(x for x in (payment.notes, f"Cancelada: {reason}") if x)
        session.add(payment)
        session.commit()
    session.refresh(payment)
    return payment
