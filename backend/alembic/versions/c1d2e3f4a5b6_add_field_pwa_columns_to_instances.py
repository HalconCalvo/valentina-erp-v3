"""add field PWA columns to sales_order_item_instances

Revision ID: c1d2e3f4a5b6
Revises: b9c0d1e2f3a4
Create Date: 2026-09-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("sales_order_item_instances", schema=None) as batch_op:
        batch_op.add_column(sa.Column("leader_mdf_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("leader_stone_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("field_work_notes", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("field_scanned_packages", sa.JSON(), nullable=True))
        batch_op.create_foreign_key(
            "fk_instances_leader_mdf_id_users",
            "users",
            ["leader_mdf_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            "fk_instances_leader_stone_id_users",
            "users",
            ["leader_stone_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("sales_order_item_instances", schema=None) as batch_op:
        batch_op.drop_constraint("fk_instances_leader_stone_id_users", type_="foreignkey")
        batch_op.drop_constraint("fk_instances_leader_mdf_id_users", type_="foreignkey")
        batch_op.drop_column("field_scanned_packages")
        batch_op.drop_column("field_work_notes")
        batch_op.drop_column("leader_stone_id")
        batch_op.drop_column("leader_mdf_id")
