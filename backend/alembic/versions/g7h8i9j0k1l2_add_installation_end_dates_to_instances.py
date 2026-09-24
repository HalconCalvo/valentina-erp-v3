"""add installation end dates to sales_order_item_instances

Revision ID: g7h8i9j0k1l2
Revises: c1d2e3f4a5b6
Create Date: 2026-09-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_order_item_instances",
        sa.Column("scheduled_inst_mdf_end", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "sales_order_item_instances",
        sa.Column("scheduled_inst_stone_end", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sales_order_item_instances", "scheduled_inst_stone_end")
    op.drop_column("sales_order_item_instances", "scheduled_inst_mdf_end")
