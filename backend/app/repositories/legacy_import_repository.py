"""Legacy import — database queries only (no business logic)."""
from typing import Dict, List, Set

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.foundations import Client, TaxRate
from app.models.sales import (CustomerCreditNote, CustomerCreditNoteStatus, CustomerPayment,
                              CustomerPaymentInstallment, CXCStatus, SalesOrder, SalesOrderStatus)
from app.models.users import User

CANCELLED_ORDER_STATUSES = (SalesOrderStatus.CANCELLED, SalesOrderStatus.CANCELLED_OV)


def get_active_tax_rates(session: Session) -> List[TaxRate]:
    return list(
        session.exec(select(TaxRate).where(TaxRate.is_active == True)).all()  # noqa: E712
    )


def get_clients_by_full_name(session: Session, full_name: str) -> List[Client]:
    return list(session.exec(select(Client).where(Client.full_name == full_name)).all())


def get_users_by_full_name(session: Session, full_name: str) -> List[User]:
    return list(session.exec(select(User).where(User.full_name == full_name)).all())


def get_active_legacy_project_names(session: Session) -> Set[str]:
    rows = session.exec(
        select(SalesOrder.project_name).where(
            SalesOrder.is_legacy == True,  # noqa: E712
            SalesOrder.status != SalesOrderStatus.CANCELLED_OV,
        )
    ).all()
    return {(name or "").strip() for name in rows}


def get_order(session: Session, order_id: int) -> SalesOrder | None:
    return session.get(SalesOrder, order_id)


def get_active_orders_by_project(session: Session, project: str) -> List[SalesOrder]:
    return list(session.exec(select(SalesOrder).where(
        func.lower(func.trim(SalesOrder.project_name)) == project.strip().lower(),
        SalesOrder.status.not_in(CANCELLED_ORDER_STATUSES))).all())


def get_excel_managed_orders(session: Session) -> List[SalesOrder]:
    return list(session.exec(select(SalesOrder).where(SalesOrder.is_excel_managed == True)  # noqa: E712
                             .order_by(SalesOrder.id)).all())


def get_active_invoices(session: Session, order_id: int) -> List[CustomerPayment]:
    return list(session.exec(select(CustomerPayment).where(
        CustomerPayment.sales_order_id == order_id, CustomerPayment.status != CXCStatus.CANCELLED)
        .order_by(CustomerPayment.invoice_date, CustomerPayment.id)).all())


def get_active_installments(session: Session, cxc_id: int) -> List[CustomerPaymentInstallment]:
    return list(session.exec(select(CustomerPaymentInstallment).where(
        CustomerPaymentInstallment.customer_payment_id == cxc_id,
        CustomerPaymentInstallment.is_cancelled == False)  # noqa: E712
        .order_by(CustomerPaymentInstallment.payment_date, CustomerPaymentInstallment.id)).all())


def count_active_credit_notes(session: Session, cxc_id: int) -> int:
    return int(session.exec(select(func.count(CustomerCreditNote.id)).where(
        CustomerCreditNote.customer_payment_id == cxc_id,
        CustomerCreditNote.status == CustomerCreditNoteStatus.ACTIVE)).one() or 0)


def get_full_names(session: Session, model, ids: List[int]) -> Dict[int, str]:
    if not ids:
        return {}
    rows = session.exec(select(model.id, model.full_name).where(model.id.in_(ids))).all()
    return {row_id: name for row_id, name in rows}


def get_tax_rates_by_id(session: Session, ids: List[int]) -> Dict[int, TaxRate]:
    if not ids:
        return {}
    return {t.id: t for t in session.exec(select(TaxRate).where(TaxRate.id.in_(ids))).all()}
