"""Queries of the balance recalculation tool (no business logic)."""
from typing import Dict, Iterable, List

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.foundations import Client
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
