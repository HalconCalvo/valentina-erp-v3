"""add approval fields to inventory_audit_items

Revision ID: x2y3z4a5b6c7
Revises: w9x0y1z2a3b4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "x2y3z4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "w9x0y1z2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inventory_audit_items",
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("inventory_audit_items", sa.Column("approved_by_id", sa.Integer(), nullable=True))
    op.add_column("inventory_audit_items", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("inventory_audit_items", sa.Column("approval_notes", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_inventory_audit_items_approved_by_id",
        "inventory_audit_items",
        "users",
        ["approved_by_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_inventory_audit_items_approved_by_id", "inventory_audit_items", type_="foreignkey")
    op.drop_column("inventory_audit_items", "approval_notes")
    op.drop_column("inventory_audit_items", "approved_at")
    op.drop_column("inventory_audit_items", "approved_by_id")
    op.drop_column("inventory_audit_items", "requires_approval")
