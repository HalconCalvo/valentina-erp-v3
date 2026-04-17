"""add_instance_id_to_inventory_reservations

Revision ID: e21a30bf5441
Revises: 222e5e7b4ca0
Create Date: 2026-04-17 16:52:28.551778

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e21a30bf5441'
down_revision: Union[str, Sequence[str], None] = '222e5e7b4ca0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("inventory_reservations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("instance_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_inventory_reservations_instance_id",
            "sales_order_item_instances",
            ["instance_id"],
            ["id"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("inventory_reservations", schema=None) as batch_op:
        batch_op.drop_constraint("fk_inventory_reservations_instance_id", type_="foreignkey")
        batch_op.drop_column("instance_id")
