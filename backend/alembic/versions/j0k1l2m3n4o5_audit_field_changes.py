"""automatic change log: audit_field_changes

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-10-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j0k1l2m3n4o5"
down_revision: Union[str, Sequence[str], None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_field_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="system"),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("change_id", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("table_name", sa.String(), nullable=False),
        sa.Column("record_id", sa.String(), nullable=True),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("field_name", sa.String(), nullable=True),
        sa.Column("old_value", sa.String(), nullable=True),
        sa.Column("new_value", sa.String(), nullable=True),
    )
    op.create_index("ix_audit_field_changes_change_id", "audit_field_changes", ["change_id"])
    op.create_index("ix_audit_field_changes_record", "audit_field_changes", ["table_name", "record_id", "changed_at"])
    op.create_index("ix_audit_field_changes_user", "audit_field_changes", ["user_id", "changed_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_field_changes_user", table_name="audit_field_changes")
    op.drop_index("ix_audit_field_changes_record", table_name="audit_field_changes")
    op.drop_index("ix_audit_field_changes_change_id", table_name="audit_field_changes")
    op.drop_table("audit_field_changes")
