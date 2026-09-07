"""add reject_reason and rejected_by_user_id to quotations

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "w9x0y1z2a3b4"
down_revision: Union[str, Sequence[str], None] = "v8w9x0y1z2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("quotations", sa.Column("reject_reason", sa.String(), nullable=True))
    op.add_column("quotations", sa.Column("rejected_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_quotations_rejected_by_user_id",
        "quotations",
        "users",
        ["rejected_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_quotations_rejected_by_user_id", "quotations", type_="foreignkey")
    op.drop_column("quotations", "rejected_by_user_id")
    op.drop_column("quotations", "reject_reason")
