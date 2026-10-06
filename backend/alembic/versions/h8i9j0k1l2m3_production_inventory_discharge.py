"""production inventory discharge: reservation lifecycle, movement traceability, stock authorizations

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-10-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, Sequence[str], None] = "g7h8i9j0k1l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "production_stock_authorizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("production_batch_id", sa.Integer(), sa.ForeignKey("production_batches.id"), nullable=False),
        sa.Column("authorized_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("shortages", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_production_stock_authorizations_production_batch_id",
        "production_stock_authorizations",
        ["production_batch_id"],
    )

    op.add_column("inventory_transactions", sa.Column("production_batch_id", sa.Integer(), nullable=True))
    op.add_column("inventory_transactions", sa.Column("instance_id", sa.Integer(), nullable=True))
    op.add_column(
        "inventory_transactions",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "inventory_transactions",
        sa.Column(
            "authorization_id",
            sa.Integer(),
            sa.ForeignKey("production_stock_authorizations.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_inventory_transactions_production_batch_id", "inventory_transactions", ["production_batch_id"]
    )
    op.create_index("ix_inventory_transactions_instance_id", "inventory_transactions", ["instance_id"])

    op.add_column("inventory_reservations", sa.Column("consumed_at", sa.DateTime(), nullable=True))
    op.add_column("inventory_reservations", sa.Column("consumed_unit_cost", sa.Float(), nullable=True))
    op.add_column(
        "inventory_reservations",
        sa.Column(
            "consumed_movement_id",
            sa.Integer(),
            sa.ForeignKey("inventory_transactions.id"),
            nullable=True,
        ),
    )
    op.add_column("inventory_reservations", sa.Column("reversed_at", sa.DateTime(), nullable=True))
    op.add_column(
        "inventory_reservations",
        sa.Column("reversed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column("inventory_reservations", sa.Column("reversal_reason", sa.String(), nullable=True))
    op.add_column("inventory_reservations", sa.Column("reversal_disposition", sa.String(), nullable=True))
    op.add_column("inventory_reservations", sa.Column("cogs_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_reservations", "cogs_at")
    op.drop_column("inventory_reservations", "reversal_disposition")
    op.drop_column("inventory_reservations", "reversal_reason")
    op.drop_column("inventory_reservations", "reversed_by_user_id")
    op.drop_column("inventory_reservations", "reversed_at")
    op.drop_column("inventory_reservations", "consumed_movement_id")
    op.drop_column("inventory_reservations", "consumed_unit_cost")
    op.drop_column("inventory_reservations", "consumed_at")

    op.drop_index("ix_inventory_transactions_instance_id", table_name="inventory_transactions")
    op.drop_index("ix_inventory_transactions_production_batch_id", table_name="inventory_transactions")
    op.drop_column("inventory_transactions", "authorization_id")
    op.drop_column("inventory_transactions", "user_id")
    op.drop_column("inventory_transactions", "instance_id")
    op.drop_column("inventory_transactions", "production_batch_id")

    op.drop_index(
        "ix_production_stock_authorizations_production_batch_id",
        table_name="production_stock_authorizations",
    )
    op.drop_table("production_stock_authorizations")
