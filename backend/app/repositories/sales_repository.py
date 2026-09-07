"""Sales domain — database queries only (no business logic)."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload

from app.models.design import ProductVersion
from app.models.foundations import Client, TaxRate
from app.models.material import Material
from app.models.sales import (
    CustomerPayment,
    CustomerPaymentInstallment,
    CXCStatus,
    CommissionType,
    PaymentType,
    SalesCommission,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.models.treasury import BankAccount, BankTransaction
from app.models.users import User, UserRole


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


def get_advance_payment_by_order(session: Session, order_id: int) -> Optional[CustomerPayment]:
    return session.exec(
        select(CustomerPayment).where(
            CustomerPayment.sales_order_id == order_id,
            CustomerPayment.payment_type == PaymentType.ADVANCE,
        )
    ).first()


def get_items_by_order(session: Session, order_id: int) -> List[SalesOrderItem]:
    return list(
        session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)).all()
    )


def get_active_instances_by_item(session: Session, item_id: int) -> List[SalesOrderItemInstance]:
    return list(
        session.exec(
            select(SalesOrderItemInstance).where(
                SalesOrderItemInstance.sales_order_item_id == item_id,
                SalesOrderItemInstance.is_cancelled == False,  # noqa: E712
            )
        ).all()
    )


def get_directors(session: Session) -> List[User]:
    return list(
        session.exec(
            select(User).where(User.role == UserRole.DIRECTOR, User.is_active == True)  # noqa: E712
        ).all()
    )


def get_cxc_by_id(session: Session, cxc_id: int) -> Optional[CustomerPayment]:
    return session.get(CustomerPayment, cxc_id)


def get_tax_rate_by_id(session: Session, tax_rate_id: int) -> Optional[TaxRate]:
    return session.get(TaxRate, tax_rate_id)


def get_installment_by_id(session: Session, installment_id: int) -> Optional[CustomerPaymentInstallment]:
    return session.get(CustomerPaymentInstallment, installment_id)


def get_bank_account_by_id(session: Session, account_id: int) -> Optional[BankAccount]:
    return session.get(BankAccount, account_id)


def get_bank_transaction_by_id(session: Session, transaction_id: int) -> Optional[BankTransaction]:
    return session.get(BankTransaction, transaction_id)


def get_installments_by_cxc(session: Session, cxc_id: int) -> List[CustomerPaymentInstallment]:
    return list(
        session.exec(
            select(CustomerPaymentInstallment)
            .where(CustomerPaymentInstallment.customer_payment_id == cxc_id)
            .order_by(CustomerPaymentInstallment.payment_date)
        ).all()
    )


def get_instances_by_cxc(session: Session, cxc_id: int) -> List[SalesOrderItemInstance]:
    return list(
        session.exec(
            select(SalesOrderItemInstance).where(
                SalesOrderItemInstance.customer_payment_id == cxc_id
            )
        ).all()
    )


def get_full_invoice_by_order(session: Session, order_id: int) -> Optional[CustomerPayment]:
    return session.exec(
        select(CustomerPayment).where(
            CustomerPayment.sales_order_id == order_id,
            CustomerPayment.payment_type == PaymentType.FULL,
            CustomerPayment.status != CXCStatus.CANCELLED,
        )
    ).first()


def get_payment_by_id(session: Session, payment_id: int) -> Optional[CustomerPayment]:
    return session.get(CustomerPayment, payment_id)


def get_instance_by_id(session: Session, instance_id: int) -> Optional[SalesOrderItemInstance]:
    return session.get(SalesOrderItemInstance, instance_id)


def get_item_by_id(session: Session, item_id: int) -> Optional[SalesOrderItem]:
    return session.get(SalesOrderItem, item_id)


def get_instance_for_order(
    session: Session, instance_id: int, order_id: int
) -> Optional[SalesOrderItemInstance]:
    return session.exec(
        select(SalesOrderItemInstance)
        .join(SalesOrderItem, SalesOrderItemInstance.sales_order_item_id == SalesOrderItem.id)
        .where(
            SalesOrderItemInstance.id == instance_id,
            SalesOrderItem.sales_order_id == order_id,
        )
    ).first()


def get_last_active_installment_date(session: Session, cxc_id: int):
    return session.exec(
        select(CustomerPaymentInstallment.payment_date)
        .where(
            CustomerPaymentInstallment.customer_payment_id == cxc_id,
            CustomerPaymentInstallment.is_cancelled == False,  # noqa: E712
        )
        .order_by(CustomerPaymentInstallment.payment_date.desc())
    ).first()


def get_product_version_with_components(session: Session, version_id: int) -> Optional[ProductVersion]:
    stmt = (
        select(ProductVersion)
        .where(ProductVersion.id == version_id)
        .options(selectinload(ProductVersion.components))
    )
    return session.exec(stmt).first()


def get_material_by_id(session: Session, material_id: int) -> Optional[Material]:
    return session.get(Material, material_id)


def get_user_by_id(session: Session, user_id: int) -> Optional[User]:
    return session.get(User, user_id)


def get_commission_by_id(session: Session, commission_id: int) -> Optional[SalesCommission]:
    return session.get(SalesCommission, commission_id)


def get_commissions_by_filters(
    session: Session,
    user_id: Optional[int] = None,
    commission_type: Optional[str] = None,
    is_paid: Optional[bool] = None,
) -> List[SalesCommission]:
    stmt = select(SalesCommission)
    if user_id is not None:
        stmt = stmt.where(SalesCommission.user_id == user_id)
    if commission_type is not None:
        stmt = stmt.where(SalesCommission.commission_type == commission_type)
    if is_paid is not None:
        stmt = stmt.where(SalesCommission.is_paid == is_paid)
    return list(session.exec(stmt.order_by(SalesCommission.created_at.desc())).all())


def get_commissions_payroll_overview_data(session: Session) -> dict:
    waiting_orders = list(
        session.exec(
            select(SalesOrder).where(SalesOrder.status == SalesOrderStatus.WAITING_ADVANCE)
        ).all()
    )
    pending_cxc = list(
        session.exec(
            select(SalesCommission, CustomerPayment)
            .join(CustomerPayment, SalesCommission.customer_payment_id == CustomerPayment.id)
            .where(
                SalesCommission.commission_type == CommissionType.SELLER,
                SalesCommission.is_paid == False,  # noqa: E712
                CustomerPayment.status == CXCStatus.PENDING,
            )
        ).all()
    )
    ready = list(
        session.exec(
            select(SalesCommission, CustomerPayment)
            .join(CustomerPayment, SalesCommission.customer_payment_id == CustomerPayment.id)
            .where(
                SalesCommission.commission_type == CommissionType.SELLER,
                SalesCommission.is_paid == False,  # noqa: E712
                SalesCommission.payroll_deferred == False,  # noqa: E712
                CustomerPayment.status == CXCStatus.PAID,
            )
        ).all()
    )
    paid = list(
        session.exec(
            select(SalesCommission)
            .where(
                SalesCommission.commission_type == CommissionType.SELLER,
                SalesCommission.is_paid == True,  # noqa: E712
            )
            .order_by(SalesCommission.created_at.desc())
        ).all()
    )
    return {
        "waiting_orders": waiting_orders,
        "pending_cxc": pending_cxc,
        "ready": ready,
        "paid": paid,
    }


def clear_order_items_and_instances(session: Session, order_id: int) -> None:
    for item in get_items_by_order(session, order_id):
        session.exec(
            delete(SalesOrderItemInstance).where(
                SalesOrderItemInstance.sales_order_item_id == item.id
            )
        )
    session.exec(delete(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id))
    session.flush()
