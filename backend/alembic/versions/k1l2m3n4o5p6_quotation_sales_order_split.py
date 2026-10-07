"""Quotation / sales order split: quotation lifecycle columns and migration of quote-like sales orders.

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-10-07

- quotations: new lifecycle columns (authorization, changes requested, lost, converted); the old
  sent/accepted/rejected columns are folded into them and dropped.
- Existing quotation statuses: SENT -> PENDING_AUTH, ACCEPTED -> AUTHORIZED (CONVERTED if linked to an
  order), REJECTED -> LOST.
- Sales orders that are really quotations (DRAFT, SENT, CHANGE_REQUESTED, REJECTED, CLIENT_REJECTED and
  ACCEPTED without instances; never legacy) are copied to quotations with their items. The order is
  cancelled logically (status CANCELLED, linked through quotation_id, note appended). Nothing is deleted.
"""
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    sa.Column("auth_requested_at", sa.DateTime(), nullable=True),
    sa.Column("authorized_at", sa.DateTime(), nullable=True),
    sa.Column("authorized_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    sa.Column("director_notes", sa.String(), nullable=True),
    sa.Column("changes_requested_at", sa.DateTime(), nullable=True),
    sa.Column("changes_requested_reason", sa.String(), nullable=True),
    sa.Column("changes_requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    sa.Column("lost_at", sa.DateTime(), nullable=True),
    sa.Column("lost_reason", sa.String(), nullable=True),
    sa.Column("converted_at", sa.DateTime(), nullable=True),
]
OLD_COLUMNS = ["sent_at", "accepted_at", "rejected_at", "reject_reason", "rejected_by_user_id"]

# Sales order status -> (quotation status, reason for the lifecycle field)
ORDER_STATUS_MAP = {
    "DRAFT": ("DRAFT", None),
    "SENT": ("PENDING_AUTH", None),
    "CHANGE_REQUESTED": ("CHANGES_REQUESTED", "Migrada: regresada por Dirección para cambios"),
    "REJECTED": ("CHANGES_REQUESTED", "Migrada: rechazada por Dirección"),
    "ACCEPTED": ("AUTHORIZED", None),
    "CLIENT_REJECTED": ("LOST", "Migrada: marcada como perdida"),
}
COPIED_HEADER_FIELDS = [
    "client_id", "tax_rate_id", "user_id", "project_name", "created_at", "valid_until", "delivery_date",
    "applied_margin_percent", "applied_tolerance_percent", "applied_commission_percent", "commission_amount",
    "advance_percent", "has_advance_invoice", "advance_invoice_amount", "currency", "exchange_rate",
    "estimated_installation_cost", "estimated_manufacturing_cost", "subtotal", "tax_amount", "total_price",
    "notes", "conditions", "external_invoice_ref", "is_warranty",
]
COPIED_ITEM_FIELDS = [
    "product_name", "origin_version_id", "quantity", "unit_price", "subtotal_price", "cost_snapshot",
    "frozen_unit_cost", "is_resale", "resale_sku", "commercial_description",
]


def _tables(bind):
    meta = sa.MetaData()
    names = ["quotations", "quotation_items", "sales_orders", "sales_order_items", "sales_order_item_instances"]
    meta.reflect(bind=bind, only=names)
    return [meta.tables[n] for n in names]


def _map_existing_quotations(bind, quotations) -> None:
    q = quotations.c
    bind.execute(quotations.update().where(q.status == "SENT").values(status="PENDING_AUTH", auth_requested_at=q.sent_at))
    bind.execute(quotations.update().where(q.status == "ACCEPTED", q.sales_order_id.is_not(None))
                 .values(status="CONVERTED", authorized_at=q.accepted_at, converted_at=q.accepted_at))
    bind.execute(quotations.update().where(q.status == "ACCEPTED").values(status="AUTHORIZED", authorized_at=q.accepted_at))
    bind.execute(quotations.update().where(q.status == "REJECTED")
                 .values(status="LOST", lost_at=q.rejected_at, lost_reason=q.reject_reason))


def _quote_like_orders(bind, orders, items, instances):
    has_instances = (
        sa.select(sa.literal(1)).select_from(items.join(instances, instances.c.sales_order_item_id == items.c.id))
        .where(items.c.sales_order_id == orders.c.id).exists()
    )
    accepted_without_instances = sa.and_(orders.c.status == "ACCEPTED", ~has_instances)
    other_quote_statuses = orders.c.status.in_([s for s in ORDER_STATUS_MAP if s != "ACCEPTED"])
    stmt = (
        sa.select(orders).where(sa.or_(other_quote_statuses, accepted_without_instances))
        .where(sa.or_(orders.c.is_legacy.is_(None), orders.c.is_legacy == sa.false()))
        .order_by(orders.c.id)
    )
    return bind.execute(stmt).mappings().all()


def _lifecycle_values(status: str, reason, order) -> dict:
    stamp = order["created_at"] or datetime.utcnow()
    if status == "PENDING_AUTH":
        return {"auth_requested_at": stamp}
    if status == "AUTHORIZED":
        return {"authorized_at": order["director_approved_at"] or stamp}
    if status == "CHANGES_REQUESTED":
        return {"changes_requested_at": stamp, "changes_requested_reason": reason}
    if status == "LOST":
        return {"lost_at": stamp, "lost_reason": reason}
    return {}


def _copy_order(bind, order, quotations, quotation_items, orders, items) -> None:
    status, reason = ORDER_STATUS_MAP[str(order["status"])]
    values = {f: order[f] for f in COPIED_HEADER_FIELDS}
    values.update(status=status, **_lifecycle_values(status, reason, order))
    quotation_id = bind.execute(quotations.insert().values(**values).returning(quotations.c.id)).scalar_one()
    rows = bind.execute(sa.select(items).where(items.c.sales_order_id == order["id"])).mappings().all()
    for row in rows:
        item_values = {f: row[f] for f in COPIED_ITEM_FIELDS}
        bind.execute(quotation_items.insert().values(quotation_id=quotation_id, is_cancelled=False, **item_values))
    note = f"[Migrada a cotización COT-{quotation_id:04d}; estado previo {order['status']}]"
    new_notes = f"{order['notes']}\n{note}" if order["notes"] else note
    bind.execute(orders.update().where(orders.c.id == order["id"])
                 .values(status="CANCELLED", quotation_id=quotation_id, notes=new_notes))


def upgrade() -> None:
    for column in NEW_COLUMNS:
        op.add_column("quotations", column)
    bind = op.get_bind()
    quotations, quotation_items, orders, items, instances = _tables(bind)
    _map_existing_quotations(bind, quotations)
    for order in _quote_like_orders(bind, orders, items, instances):
        _copy_order(bind, order, quotations, quotation_items, orders, items)
    with op.batch_alter_table("quotations") as batch:
        for name in OLD_COLUMNS:
            batch.drop_column(name)


def downgrade() -> None:
    # Structural rollback only: copied quotations stay and migrated orders stay CANCELLED (traceable via quotation_id).
    op.add_column("quotations", sa.Column("sent_at", sa.DateTime(), nullable=True))
    op.add_column("quotations", sa.Column("accepted_at", sa.DateTime(), nullable=True))
    op.add_column("quotations", sa.Column("rejected_at", sa.DateTime(), nullable=True))
    op.add_column("quotations", sa.Column("reject_reason", sa.String(), nullable=True))
    op.add_column("quotations", sa.Column("rejected_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.execute("UPDATE quotations SET status = 'SENT', sent_at = auth_requested_at WHERE status = 'PENDING_AUTH'")
    op.execute("UPDATE quotations SET status = 'ACCEPTED', accepted_at = authorized_at WHERE status IN ('AUTHORIZED', 'CONVERTED')")
    op.execute("UPDATE quotations SET status = 'REJECTED', rejected_at = lost_at, reject_reason = lost_reason WHERE status = 'LOST'")
    op.execute("UPDATE quotations SET status = 'DRAFT' WHERE status = 'CHANGES_REQUESTED'")
    with op.batch_alter_table("quotations") as batch:
        for column in NEW_COLUMNS:
            batch.drop_column(column.name)
