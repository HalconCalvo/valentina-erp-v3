"""add is_legacy to sales_orders

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_orders",
        sa.Column(
            "is_legacy",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("sales_orders", "is_legacy")
