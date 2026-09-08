"""add commission release fields to sales_commissions

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "y3z4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "x2y3z4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_commissions",
        sa.Column("is_advance", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "sales_commissions",
        sa.Column("is_released", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("sales_commissions", sa.Column("released_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE sales_commissions
        SET is_released = true,
            released_at = COALESCE(released_at, created_at)
        WHERE is_paid = true
        """
    )


def downgrade() -> None:
    op.drop_column("sales_commissions", "released_at")
    op.drop_column("sales_commissions", "is_released")
    op.drop_column("sales_commissions", "is_advance")
