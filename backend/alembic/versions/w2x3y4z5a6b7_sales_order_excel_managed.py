"""Sales orders that come in the migration Excel (advisor, 13/10): they go in its download.
Existing legacy orders that are not cancelled start as coming in the Excel.

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-10-13
"""
import sqlalchemy as sa
from alembic import op

revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_orders", sa.Column("is_excel_managed", sa.Boolean(), nullable=False,
                                            server_default=sa.false()))
    op.execute("UPDATE sales_orders SET is_excel_managed = true "
               "WHERE is_legacy = true AND status NOT IN ('CANCELLED', 'CANCELLED_OV')")


def downgrade() -> None:
    op.drop_column("sales_orders", "is_excel_managed")
