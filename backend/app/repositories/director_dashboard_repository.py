"""Queries of the Director dashboard: sold OVs of a year, their lines, clients and collections."""
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from sqlmodel import Session, func, select

from app.models.foundations import Client, GlobalConfig
from app.models.material import Material
from app.models.sales import (CustomerPayment, CustomerPaymentInstallment, CXCStatus, SalesOrder, SalesOrderItem,
                              SalesOrderStatus)
from app.models.treasury import BankAccount

# An OV exists once the client sent its purchase order: every OV not cancelled counts as sold
SOLD_STATUSES = (SalesOrderStatus.WAITING_ADVANCE, SalesOrderStatus.SOLD, SalesOrderStatus.IN_PRODUCTION,
                 SalesOrderStatus.FINISHED, SalesOrderStatus.COMPLETED)


def _year_range(year: int) -> tuple:
    return datetime(year, 1, 1), datetime(year + 1, 1, 1)


def get_sold_orders(session: Session, year: int) -> List[SalesOrder]:
    """Sold OVs dated in the year (client PO date; creation date when the OV has none)."""
    start, end = _year_range(year)
    sold_on = func.coalesce(SalesOrder.client_po_date, SalesOrder.created_at)
    return list(session.exec(select(SalesOrder).where(SalesOrder.status.in_(SOLD_STATUSES),
                                                      sold_on >= start, sold_on < end)).all())


def get_active_items(session: Session, order_ids: Iterable[int]) -> List[SalesOrderItem]:
    ids = list(order_ids)
    if not ids:
        return []
    return list(session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id.in_(ids),
                                                          SalesOrderItem.is_cancelled == False)).all())  # noqa: E712


def get_client_names(session: Session, client_ids: Iterable[int]) -> Dict[int, str]:
    ids = list(set(client_ids))
    if not ids:
        return {}
    return {c.id: c.full_name for c in session.exec(select(Client).where(Client.id.in_(ids))).all()}


def get_material_categories(session: Session, material_ids: Iterable[int]) -> Dict[int, str]:
    ids = list(set(material_ids))
    if not ids:
        return {}
    rows = session.exec(select(Material.id, Material.category).where(Material.id.in_(ids))).all()
    return {mid: category for mid, category in rows}


def get_global_config(session: Session) -> Optional[GlobalConfig]:
    return session.exec(select(GlobalConfig)).first()


def get_active_banks(session: Session) -> List[BankAccount]:
    return list(session.exec(select(BankAccount).where(BankAccount.is_active == True)  # noqa: E712
                             .order_by(BankAccount.name)).all())


def get_year_collections(session: Session, year: int) -> list:
    """(client_id, invoice_date, amount, collected_on) of every active installment collected in the year."""
    start, end = _year_range(year)
    return list(session.exec(
        select(SalesOrder.client_id, CustomerPayment.invoice_date, CustomerPaymentInstallment.amount,
               CustomerPaymentInstallment.payment_date)
        .join(CustomerPayment, CustomerPayment.id == CustomerPaymentInstallment.customer_payment_id)
        .join(SalesOrder, SalesOrder.id == CustomerPayment.sales_order_id)
        .where(CustomerPaymentInstallment.is_cancelled == False,  # noqa: E712
               CustomerPayment.status != CXCStatus.CANCELLED,
               CustomerPaymentInstallment.payment_date >= start, CustomerPaymentInstallment.payment_date < end)
    ).all())
