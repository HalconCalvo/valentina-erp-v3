from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.inventory import InventoryTransaction, PurchaseOrder, PurchaseOrderItem, InventoryAudit, InventoryAuditItem
from app.models.material import Material


def get_material_by_id(db: Session, material_id: int) -> Optional[Material]:
    return db.get(Material, material_id)


def has_opening_balance(db: Session, material_id: int) -> bool:
    row = db.exec(
        select(InventoryTransaction.id).where(
            InventoryTransaction.material_id == material_id,
            InventoryTransaction.transaction_type.in_(["OPENING_BALANCE", "AJUSTE_INICIAL"]),
        )
    ).first()
    return row is not None


def get_kardex(
    db: Session,
    material_id: int,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> List[InventoryTransaction]:
    query = (
        select(InventoryTransaction)
        .where(InventoryTransaction.material_id == material_id)
        .order_by(InventoryTransaction.created_at, InventoryTransaction.id)
    )
    if date_from is not None:
        query = query.where(InventoryTransaction.created_at >= date_from)
    if date_to is not None:
        query = query.where(InventoryTransaction.created_at <= date_to)
    return list(db.exec(query).all())


def calcular_saldo_a_fecha(db: Session, material_id: int, fecha: datetime) -> float:
    resultado = db.exec(
        select(func.sum(InventoryTransaction.quantity)).where(
            InventoryTransaction.material_id == material_id,
            InventoryTransaction.created_at <= fecha,
        )
    ).first()
    if resultado is None:
        return 0.0
    valor = resultado[0] if hasattr(resultado, "__getitem__") else resultado
    return float(valor) if valor is not None else 0.0


def get_low_stock_materials(db: Session, threshold_percent: float = 0.20) -> List[Material]:
    transit_subq = (
        select(
            PurchaseOrderItem.material_id,
            func.sum(PurchaseOrderItem.quantity_ordered).label("en_transito"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(PurchaseOrder.status.in_(["DRAFT", "AUTORIZADA", "ENVIADA"]))
        .group_by(PurchaseOrderItem.material_id)
        .subquery()
    )
    statement = (
        select(Material)
        .outerjoin(transit_subq, Material.id == transit_subq.c.material_id)
        .where(Material.min_stock > 0)
        .where(Material.is_active == True)  # noqa: E712
        .where(
            (Material.physical_stock + func.coalesce(transit_subq.c.en_transito, 0))
            <= (Material.min_stock * (1 + threshold_percent))
        )
    )
    return list(db.exec(statement).all())


def get_inventory_valuation(db: Session) -> float:
    materials = db.exec(select(Material).where(Material.is_active == True)).all()  # noqa: E712
    return sum(
        float(m.physical_stock or 0.0) * (float(m.current_cost or 0.0) / (float(m.conversion_factor or 1.0) or 1.0))
        for m in materials
    )


def get_active_audit_session(db: Session) -> Optional[InventoryAudit]:
    return db.exec(
        select(InventoryAudit).where(
            InventoryAudit.status.in_(["EN_CAPTURA", "ESPERANDO_AUTORIZACION"])
        )
    ).first()


def get_audit_by_id(db: Session, audit_id: int) -> Optional[InventoryAudit]:
    return db.get(InventoryAudit, audit_id)


def get_audit_items(db: Session, audit_id: int) -> List[InventoryAuditItem]:
    return list(
        db.exec(
            select(InventoryAuditItem).where(InventoryAuditItem.audit_id == audit_id)
        ).all()
    )


def get_audit_item_by_id(db: Session, item_id: int) -> Optional[InventoryAuditItem]:
    return db.get(InventoryAuditItem, item_id)


def get_all_active_materials(db: Session) -> List[Material]:
    return list(db.exec(select(Material).where(Material.is_active == True)).all())  # noqa: E712
