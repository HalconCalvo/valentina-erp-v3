"""inventory cut date: effective vs recorded dates, audit cut, period locks, recounts, value threshold

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-10-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, Sequence[str], None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory_audits", sa.Column("cut_date", sa.Date(), nullable=True))
    op.add_column("inventory_audits", sa.Column("cut_at", sa.DateTime(), nullable=True))
    op.add_column("inventory_audits", sa.Column("closed_at", sa.DateTime(), nullable=True))

    op.add_column("inventory_audit_items", sa.Column("approval_reason", sa.String(), nullable=True))
    op.add_column("inventory_audit_items", sa.Column("unit_cost_at_cut", sa.Float(), nullable=True))
    op.add_column(
        "inventory_audit_items",
        sa.Column("adjustment_movement_id", sa.Integer(), sa.ForeignKey("inventory_transactions.id"), nullable=True),
    )
    op.add_column(
        "inventory_audit_items",
        sa.Column("auto_zero", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column(
        "inventory_transactions",
        sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.execute("UPDATE inventory_transactions SET recorded_at = created_at WHERE created_at IS NOT NULL")
    op.add_column(
        "inventory_transactions",
        sa.Column("audit_id", sa.Integer(), sa.ForeignKey("inventory_audits.id"), nullable=True),
    )
    op.add_column(
        "inventory_transactions",
        sa.Column("audit_item_id", sa.Integer(), sa.ForeignKey("inventory_audit_items.id"), nullable=True),
    )
    op.add_column(
        "inventory_transactions",
        sa.Column("reverses_movement_id", sa.Integer(), sa.ForeignKey("inventory_transactions.id"), nullable=True),
    )
    op.create_index("ix_inventory_transactions_audit_id", "inventory_transactions", ["audit_id"])

    op.add_column(
        "global_config",
        sa.Column(
            "inventory_audit_value_threshold", sa.Float(), nullable=False, server_default=sa.text("2000.00")
        ),
    )

    op.create_table(
        "inventory_period_locks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("audit_id", sa.Integer(), sa.ForeignKey("inventory_audits.id"), nullable=False),
        sa.Column("locked_until", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("released_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("release_reason", sa.String(), nullable=True),
    )
    op.create_index("ix_inventory_period_locks_audit_id", "inventory_period_locks", ["audit_id"])

    op.create_table(
        "inventory_audit_item_recounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("audit_item_id", sa.Integer(), sa.ForeignKey("inventory_audit_items.id"), nullable=False),
        sa.Column("previous_counted", sa.Float(), nullable=True),
        sa.Column("new_counted", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("reversed_movement_id", sa.Integer(), sa.ForeignKey("inventory_transactions.id"), nullable=True),
        sa.Column("new_movement_id", sa.Integer(), sa.ForeignKey("inventory_transactions.id"), nullable=True),
    )
    op.create_index(
        "ix_inventory_audit_item_recounts_audit_item_id", "inventory_audit_item_recounts", ["audit_item_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_audit_item_recounts_audit_item_id", table_name="inventory_audit_item_recounts")
    op.drop_table("inventory_audit_item_recounts")
    op.drop_index("ix_inventory_period_locks_audit_id", table_name="inventory_period_locks")
    op.drop_table("inventory_period_locks")
    op.drop_column("global_config", "inventory_audit_value_threshold")
    op.drop_index("ix_inventory_transactions_audit_id", table_name="inventory_transactions")
    op.drop_column("inventory_transactions", "reverses_movement_id")
    op.drop_column("inventory_transactions", "audit_item_id")
    op.drop_column("inventory_transactions", "audit_id")
    op.drop_column("inventory_transactions", "recorded_at")
    op.drop_column("inventory_audit_items", "auto_zero")
    op.drop_column("inventory_audit_items", "adjustment_movement_id")
    op.drop_column("inventory_audit_items", "unit_cost_at_cut")
    op.drop_column("inventory_audit_items", "approval_reason")
    op.drop_column("inventory_audits", "closed_at")
    op.drop_column("inventory_audits", "cut_at")
    op.drop_column("inventory_audits", "cut_date")
