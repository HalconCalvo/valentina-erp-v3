"""Sales domain — database queries only (no business logic)."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload

from app.models.foundations import Client
from app.models.sales import (
    CustomerPayment,
    CustomerPaymentInstallment,
    CXCStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderStatus,
)


def get_orders(
    session: Session,
    status: Optional[SalesOrderStatus] = None,
    client_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> List[SalesOrder]:
    stmt = select(SalesOrder).options(
        selectinload(SalesOrder.client),
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances),
        selectinload(SalesOrder.payments),
        selectinload(SalesOrder.user),
    )
    if status is not None:
        stmt = stmt.where(SalesOrder.status == status)
    if client_id is not None:
        stmt = stmt.where(SalesOrder.client_id == client_id)
    if user_id is not None:
        stmt = stmt.where(SalesOrder.user_id == user_id)
    return list(session.exec(stmt.order_by(SalesOrder.id.desc())).unique().all())


def get_order_by_id(session: Session, order_id: int) -> Optional[SalesOrder]:
    stmt = (
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(
            selectinload(SalesOrder.client),
            selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances),
            selectinload(SalesOrder.payments),
        )
    )
    return session.exec(stmt).unique().first()


def get_customer_payments(
    session: Session,
    status: Optional[CXCStatus] = None,
    user_id: Optional[int] = None,
) -> List[CustomerPayment]:
    stmt = select(CustomerPayment).join(
        SalesOrder,
        CustomerPayment.sales_order_id == SalesOrder.id,
    )
    if user_id is not None:
        stmt = stmt.where(SalesOrder.user_id == user_id)
    if status is not None:
        stmt = stmt.where(CustomerPayment.status == status)
    return list(session.exec(stmt.order_by(CustomerPayment.id.desc())).all())


def get_pending_cxc(session: Session) -> List[CustomerPayment]:
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.status == CXCStatus.PENDING)
        .order_by(CustomerPayment.id.desc())
    )
    return list(session.exec(stmt).all())


def get_cxc_report(
    session: Session,
    estados: List[CXCStatus],
    client_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> List[CustomerPayment]:
    stmt = select(CustomerPayment).where(CustomerPayment.status.in_(estados))
    if client_id is not None:
        stmt = stmt.join(
            SalesOrder,
            CustomerPayment.sales_order_id == SalesOrder.id,
        ).where(SalesOrder.client_id == client_id)
    if date_from is not None:
        stmt = stmt.where(CustomerPayment.invoice_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(CustomerPayment.invoice_date <= date_to)
    return list(session.exec(stmt.order_by(CustomerPayment.invoice_date.asc())).all())


def get_sales_order_by_id(session: Session, order_id: int) -> Optional[SalesOrder]:
    return session.get(SalesOrder, order_id)


def get_client_by_id(session: Session, client_id: int) -> Optional[Client]:
    return session.get(Client, client_id)


def sum_active_installments(session: Session, cxc_id: int) -> float:
    val = session.exec(
        select(func.coalesce(func.sum(CustomerPaymentInstallment.amount), 0.0)).where(
            CustomerPaymentInstallment.customer_payment_id == cxc_id,
            CustomerPaymentInstallment.is_cancelled == False,  # noqa: E712
        )
    ).one()
    return float(val or 0.0)
