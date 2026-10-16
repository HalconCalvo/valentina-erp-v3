"""D40: a commission or crew payroll payment may be split among Banco, Caja chica and Efectivo Dirección; the row keeps
the breakdown as text (the movements keep their own amounts).

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_commissions", sa.Column("payment_detail", sa.String(), nullable=True))
    op.add_column("payroll_payments", sa.Column("payment_detail", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("payroll_payments", "payment_detail")
    op.drop_column("sales_commissions", "payment_detail")
