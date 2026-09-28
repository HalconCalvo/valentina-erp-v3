"""Consultas de diseño — instancias pendientes de lote (sin N+1)."""
from datetime import datetime
from typing import List, Set

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.models.design import ProductVersion
from app.models.sales import (
    PaymentStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.services.planning_service import batch_map_for_instances, compute_semaphore

_CONFIRMED_ORDER_STATUSES: Set[SalesOrderStatus] = {
    SalesOrderStatus.WAITING_ADVANCE,
    SalesOrderStatus.SOLD,
    SalesOrderStatus.IN_PRODUCTION,
    SalesOrderStatus.FINISHED,
    SalesOrderStatus.COMPLETED,
}


def list_unbatched_instances_for_design(
    session: Session,
    *,
    piedra: bool,
) -> List[SalesOrderItemInstance]:
    stmt = (
        select(SalesOrderItemInstance)
        .where(SalesOrderItemInstance.is_cancelled == False)  # noqa: E712
        .options(
            selectinload(SalesOrderItemInstance.item)
            .selectinload(SalesOrderItem.order)
            .selectinload(SalesOrder.client),
        )
    )
    if piedra:
        stmt = stmt.where(SalesOrderItemInstance.stone_batch_id == None)  # noqa: E711
    else:
        stmt = stmt.where(SalesOrderItemInstance.production_batch_id == None)  # noqa: E711
    return list(session.exec(stmt).all())


def version_flags_by_id_for_instances(
    session: Session,
    instances: List[SalesOrderItemInstance],
) -> dict[int, ProductVersion]:
    version_ids: set[int] = set()
    for inst in instances:
        item = inst.item
        if item and item.origin_version_id:
            version_ids.add(item.origin_version_id)
    if not version_ids:
        return {}
    rows = session.exec(
        select(ProductVersion).where(ProductVersion.id.in_(version_ids))
    ).all()
    return {v.id: v for v in rows if v.id is not None}


def build_pending_instance_rows(
    session: Session,
    batch_type: str,
) -> List[dict]:
    piedra = batch_type.upper() == "PIEDRA"
    instances = list_unbatched_instances_for_design(session, piedra=piedra)
    batch_by_id = batch_map_for_instances(session, instances)
    version_by_id = version_flags_by_id_for_instances(session, instances)
    now = datetime.utcnow()
    result: List[dict] = []
    for inst in instances:
        item = inst.item
        if not item or item.is_resale:
            continue
        order = item.order
        if not order:
            continue
        is_paid = order.payment_status in (PaymentStatus.PARTIAL, PaymentStatus.PAID)
        if not (is_paid or order.status in _CONFIRMED_ORDER_STATUSES):
            continue
        version = (
            version_by_id.get(item.origin_version_id)
            if item.origin_version_id
            else None
        )
        if not version:
            continue
        if piedra:
            if not version.has_stone_components:
                continue
        elif not version.has_mdf_components:
            continue
        client = order.client
        client_name = client.full_name if client else None
        result.append(
            {
                "id": inst.id,
                "custom_name": inst.custom_name,
                "product_name": item.product_name,
                "order_project_name": order.project_name,
                "order_id": order.id,
                "client_name": client_name,
                "stone_pieces": inst.stone_pieces,
                "semaphore": compute_semaphore(inst, now, batch_by_id=batch_by_id),
                "schedule": {
                    "PM": inst.scheduled_prod_mdf.isoformat() if inst.scheduled_prod_mdf else None,
                    "PP": inst.scheduled_prod_stone.isoformat() if inst.scheduled_prod_stone else None,
                    "IM": inst.scheduled_inst_mdf.isoformat() if inst.scheduled_inst_mdf else None,
                    "IP": inst.scheduled_inst_stone.isoformat() if inst.scheduled_inst_stone else None,
                },
            }
        )
    return result
