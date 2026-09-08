"""add retention fields to sales orders and customer payments

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "z4a5b6c7d8e9"
down_revision: Union[str, Sequence[str], None] = "y3z4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_orders",
        sa.Column("default_retention_percent", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sales_orders",
        sa.Column("default_retention_days", sa.Integer(), nullable=False, server_default="90"),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_percent", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_amount", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_due_date", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_status", sa.String(), nullable=True),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_invoice_folio", sa.String(), nullable=True),
    )
    op.add_column(
        "customer_payments",
        sa.Column("retention_notes", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customer_payments", "retention_notes")
    op.drop_column("customer_payments", "retention_invoice_folio")
    op.drop_column("customer_payments", "retention_status")
    op.drop_column("customer_payments", "retention_due_date")
    op.drop_column("customer_payments", "retention_days")
    op.drop_column("customer_payments", "retention_amount")
    op.drop_column("customer_payments", "retention_percent")
    op.drop_column("sales_orders", "default_retention_days")
    op.drop_column("sales_orders", "default_retention_percent")
