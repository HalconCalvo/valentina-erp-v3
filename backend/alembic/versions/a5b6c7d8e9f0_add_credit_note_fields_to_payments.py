"""add credit note fields to customer payments

Revision ID: a5b6c7d8e9f0
Revises: z4a5b6c7d8e9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "z4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customer_payments",
        sa.Column("nc_advance_folio", sa.String(), nullable=True),
    )
    op.add_column(
        "customer_payments",
        sa.Column("nc_advance_amount", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_payments",
        sa.Column("nc_retention_folio", sa.String(), nullable=True),
    )
    op.add_column(
        "customer_payments",
        sa.Column("nc_retention_amount", sa.Float(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("customer_payments", "nc_retention_amount")
    op.drop_column("customer_payments", "nc_retention_folio")
    op.drop_column("customer_payments", "nc_advance_amount")
    op.drop_column("customer_payments", "nc_advance_folio")
