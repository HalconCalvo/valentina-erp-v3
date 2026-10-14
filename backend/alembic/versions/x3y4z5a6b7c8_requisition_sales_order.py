"""Requisitions and purchase order lines linked to a sales order (H21, D31): the purchase says which OV it is for.

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-10-14
"""
import sqlalchemy as sa
from alembic import op

revision = "x3y4z5a6b7c8"
down_revision = "w2x3y4z5a6b7"
branch_labels = None
depends_on = None

TABLES = ("purchase_requisitions", "purchase_order_items")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("sales_order_id", sa.Integer(), nullable=True))
        op.create_foreign_key(f"fk_{table}_sales_order", table, "sales_orders", ["sales_order_id"], ["id"])
        op.create_index(f"ix_{table}_sales_order_id", table, ["sales_order_id"])


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"ix_{table}_sales_order_id", table_name=table)
        op.drop_constraint(f"fk_{table}_sales_order", table, type_="foreignkey")
        op.drop_column(table, "sales_order_id")
