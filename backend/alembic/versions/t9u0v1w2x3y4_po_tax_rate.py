"""Tax rate on purchase orders (D4): 0.16, 0.08 or 0.0; existing orders keep 16%.

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op

revision = "t9u0v1w2x3y4"
down_revision = "s8t9u0v1w2x3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("purchase_orders")}
    if "tax_rate" not in existing:
        with op.batch_alter_table("purchase_orders") as batch:
            batch.add_column(sa.Column("tax_rate", sa.Float(), nullable=False, server_default="0.16"))


def downgrade() -> None:
    with op.batch_alter_table("purchase_orders") as batch:
        batch.drop_column("tax_rate")
