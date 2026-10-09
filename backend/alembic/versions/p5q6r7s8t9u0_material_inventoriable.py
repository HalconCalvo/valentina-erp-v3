"""Inventoriable yes/no per material and lines taken out of a physical inventory session.

Revision ID: p5q6r7s8t9u0
Revises: l2m3n4o5p6q7
Create Date: 2026-10-09

- materials.is_inventoriable (default true). Initial value: yes for MATERIAL; no for PROCESO (maquila and
  installation services: cost in the recipe, no stock), CONSUMIBLE and SERVICIO **without stock**. Materials with stock keep "yes" until marked "no" from the app, which sends their
  stock to expense with a reason (it must not happen silently in a migration).
- inventory_audit_items.excluded_at / excluded_reason / excluded_by_user_id.
"""
import sqlalchemy as sa
from alembic import op

revision = "p5q6r7s8t9u0"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def _missing(table: str, column: str) -> bool:
    return column not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if _missing("materials", "is_inventoriable"):
        with op.batch_alter_table("materials") as batch:
            batch.add_column(sa.Column("is_inventoriable", sa.Boolean(), nullable=False, server_default=sa.true()))
    with op.batch_alter_table("inventory_audit_items") as batch:
        if _missing("inventory_audit_items", "excluded_at"):
            batch.add_column(sa.Column("excluded_at", sa.DateTime(), nullable=True))
        if _missing("inventory_audit_items", "excluded_reason"):
            batch.add_column(sa.Column("excluded_reason", sa.String(), nullable=True))
        if _missing("inventory_audit_items", "excluded_by_user_id"):
            batch.add_column(sa.Column("excluded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.execute(
        "UPDATE materials SET is_inventoriable = false "
        "WHERE CAST(production_route AS VARCHAR) IN ('PROCESO', 'CONSUMIBLE', 'SERVICIO') "
        "AND ABS(COALESCE(physical_stock, 0)) <= 0.0001"
    )


def downgrade() -> None:
    with op.batch_alter_table("inventory_audit_items") as batch:
        batch.drop_column("excluded_by_user_id")
        batch.drop_column("excluded_reason")
        batch.drop_column("excluded_at")
    with op.batch_alter_table("materials") as batch:
        batch.drop_column("is_inventoriable")
