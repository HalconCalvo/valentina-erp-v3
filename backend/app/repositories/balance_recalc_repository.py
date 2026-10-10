"""Queries of the balance recalculation tool (no business logic)."""
from typing import Dict, Iterable, List

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice, SupplierPayment
from app.models.foundations import Client, Provider
from app.models.sales import (
    CustomerCreditNote, CustomerCreditNoteStatus, CustomerPayment, CustomerPaymentInstallment, CXCStatus, SalesOrder,
)


def get_orders_by_status(session: Session, statuses: Iterable) -> List[SalesOrder]:
    return list(session.exec(select(SalesOrder).where(SalesOrder.status.in_(list(statuses))).order_by(SalesOrder.id)))


def get_active_invoices(session: Session) -> List[CustomerPayment]:
    return list(session.exec(
        select(CustomerPayment).where(CustomerPayment.status != CXCStatus.CANCELLED).order_by(CustomerPayment.id)))


def collected_by_invoice(session: Session) -> Dict[int, float]:
    rows = session.exec(
        select(CustomerPaymentInstallment.customer_payment_id, func.sum(CustomerPaymentInstallment.amount))
        .where(CustomerPaymentInstallment.is_cancelled == False)  # noqa: E712
        .group_by(CustomerPaymentInstallment.customer_payment_id)
    ).all()
    return {int(cxc_id): float(total or 0.0) for cxc_id, total in rows}


def credited_by_invoice(session: Session) -> Dict[int, float]:
    rows = session.exec(
        select(CustomerCreditNote.customer_payment_id, func.sum(CustomerCreditNote.amount))
        .where(CustomerCreditNote.status == CustomerCreditNoteStatus.ACTIVE,
               CustomerCreditNote.customer_payment_id.is_not(None))
        .group_by(CustomerCreditNote.customer_payment_id)
    ).all()
    return {int(cxc_id): float(total or 0.0) for cxc_id, total in rows}


def last_installment_date_by_invoice(session: Session) -> Dict[int, object]:
    rows = session.exec(
        select(CustomerPaymentInstallment.customer_payment_id, func.max(CustomerPaymentInstallment.payment_date))
        .where(CustomerPaymentInstallment.is_cancelled == False)  # noqa: E712
        .group_by(CustomerPaymentInstallment.customer_payment_id)
    ).all()
    return {int(cxc_id): last for cxc_id, last in rows}


def client_names(session: Session, client_ids: Iterable[int]) -> Dict[int, str]:
    ids = list({i for i in client_ids if i})
    if not ids:
        return {}
    return {c.id: c.full_name for c in session.exec(select(Client).where(Client.id.in_(ids)))}


def get_paid_advance_invoices_without_payment(session: Session) -> List[PurchaseInvoice]:
    """Supplier advance invoices (ANT-…) in PAID with no PAID supplier payment."""
    paid = select(SupplierPayment.purchase_invoice_id).where(SupplierPayment.status == PaymentStatus.PAID)
    return list(session.exec(
        select(PurchaseInvoice).where(
            PurchaseInvoice.invoice_number.like("ANT-%"),
            PurchaseInvoice.status == InvoiceStatus.PAID,
            PurchaseInvoice.id.not_in(paid),
        ).order_by(PurchaseInvoice.id)
    ))


def provider_names(session: Session, provider_ids: Iterable[int]) -> Dict[int, str]:
    ids = list({i for i in provider_ids if i})
    if not ids:
        return {}
    return {p.id: p.business_name for p in session.exec(select(Provider).where(Provider.id.in_(ids)))}


def get_open_supplier_payments(session: Session, invoice_ids: Iterable[int]) -> List[SupplierPayment]:
    ids = list(invoice_ids)
    if not ids:
        return []
    return list(session.exec(select(SupplierPayment).where(
        SupplierPayment.purchase_invoice_id.in_(ids),
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED]))))
