"""Production inventory — database queries only (no business logic)."""
from datetime import datetime
from typing import Dict, List, Optional, Sequence

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.inventory import InventoryReservation, ProductionStockAuthorization
from app.models.material import Material
from app.models.production import ProductionBatch
from app.models.sales import CustomerPayment, Quotation, SalesOrder, SalesOrderItem, SalesOrderItemInstance
from app.models.users import User


def get_batch(session: Session, batch_id: int) -> Optional[ProductionBatch]:
    return session.get(ProductionBatch, batch_id)


def get_instance(session: Session, instance_id: int) -> Optional[SalesOrderItemInstance]:
    return session.get(SalesOrderItemInstance, instance_id)


def get_batch_instances(session: Session, batch: ProductionBatch) -> List[SalesOrderItemInstance]:
    column = (
        SalesOrderItemInstance.stone_batch_id
        if (batch.batch_type or "").upper() == "PIEDRA"
        else SalesOrderItemInstance.production_batch_id
    )
    return list(session.exec(select(SalesOrderItemInstance).where(
        column == batch.id, SalesOrderItemInstance.is_cancelled == False,  # noqa: E712
    )).all())


def get_reservations(
    session: Session,
    statuses: Sequence[str],
    batch_id: Optional[int] = None,
    instance_ids: Optional[Sequence[int]] = None,
) -> List[InventoryReservation]:
    query = select(InventoryReservation).where(InventoryReservation.status.in_(list(statuses)))
    if batch_id is not None:
        query = query.where(InventoryReservation.production_batch_id == batch_id)
    if instance_ids is not None:
        query = query.where(InventoryReservation.instance_id.in_(list(instance_ids)))
    return list(session.exec(query.order_by(InventoryReservation.id)).all())


def get_materials_by_ids(session: Session, material_ids: Sequence[int]) -> Dict[int, Material]:
    if not material_ids:
        return {}
    rows = session.exec(select(Material).where(Material.id.in_(list(set(material_ids))))).all()
    return {m.id: m for m in rows}


def get_order_ids_by_instance(session: Session, instance_ids: Sequence[int]) -> Dict[int, int]:
    if not instance_ids:
        return {}
    rows = session.exec(
        select(SalesOrderItemInstance.id, SalesOrderItem.sales_order_id)
        .join(SalesOrderItem, SalesOrderItem.id == SalesOrderItemInstance.sales_order_item_id)
        .where(SalesOrderItemInstance.id.in_(list(set(instance_ids))))
    ).all()
    return {instance_id: order_id for instance_id, order_id in rows}


def get_order_instances(session: Session, order_id: int) -> List[SalesOrderItemInstance]:
    return list(
        session.exec(
            select(SalesOrderItemInstance)
            .join(SalesOrderItem, SalesOrderItem.id == SalesOrderItemInstance.sales_order_item_id)
            .where(SalesOrderItem.sales_order_id == order_id, SalesOrderItemInstance.is_cancelled == False)  # noqa: E712
        ).all()
    )


def get_positive_stock_materials(session: Session) -> List[Material]:
    return list(session.exec(select(Material).where(Material.physical_stock > 0).order_by(Material.sku)).all())


def get_negative_stock_materials(session: Session) -> List[Material]:
    return list(session.exec(select(Material).where(Material.physical_stock < 0).order_by(Material.sku)).all())


def get_open_consumed_rows(session: Session) -> List[tuple]:
    """Consumed reservations still in inventory (not yet cost of sales) with instance and batch."""
    return list(
        session.exec(
            select(InventoryReservation, SalesOrderItemInstance, ProductionBatch)
            .join(SalesOrderItemInstance, SalesOrderItemInstance.id == InventoryReservation.instance_id)
            .join(ProductionBatch, ProductionBatch.id == InventoryReservation.production_batch_id)
            .where(InventoryReservation.status == "CONSUMIDA", InventoryReservation.cogs_at.is_(None))
        ).all()
    )


def get_reservations_in_range(
    session: Session, field_name: str, date_from: Optional[datetime], date_to: Optional[datetime]
) -> List[InventoryReservation]:
    column = getattr(InventoryReservation, field_name)
    query = select(InventoryReservation).where(column.is_not(None))
    if date_from is not None:
        query = query.where(column >= date_from)
    if date_to is not None:
        query = query.where(column <= date_to)
    return list(session.exec(query).all())


def get_stock_authorizations(session: Session) -> List[tuple]:
    return list(
        session.exec(
            select(ProductionStockAuthorization, User.full_name, ProductionBatch.folio)
            .join(User, User.id == ProductionStockAuthorization.authorized_by_user_id)
            .join(ProductionBatch, ProductionBatch.id == ProductionStockAuthorization.production_batch_id)
            .order_by(ProductionStockAuthorization.created_at.desc())
        ).all()
    )


def get_orders_with_unpaid_advance(session: Session, order_ids: Sequence[int]) -> List[SalesOrder]:
    """OVs with an agreed advance (percent or amount > 0) and no PAID ADVANCE invoice (same rule as the Kanban)."""
    if not order_ids:
        return []
    paid = (
        select(CustomerPayment.sales_order_id)
        .where(CustomerPayment.payment_type == "ADVANCE", CustomerPayment.status == "PAID")
    )
    return list(
        session.exec(
            select(SalesOrder).where(
                SalesOrder.id.in_(list(set(order_ids))),
                (SalesOrder.advance_percent > 0) | (SalesOrder.advance_invoice_amount > 0),
                SalesOrder.id.not_in(paid),
            )
        ).all()
    )


def get_change_orders_by_ids(session: Session, change_ids: Sequence[int]) -> List[Quotation]:
    ids = list({i for i in change_ids if i})
    if not ids:
        return []
    return list(session.exec(select(Quotation).where(Quotation.id.in_(ids))).all())


def sum_paid_change_advance(session: Session, change_id: int) -> float:
    value = session.exec(
        select(func.coalesce(func.sum(CustomerPayment.amount), 0.0)).where(
            CustomerPayment.change_quotation_id == change_id,
            CustomerPayment.payment_type == "ADVANCE",
            CustomerPayment.status == "PAID",
        )
    ).one()
    return float(value or 0.0)
