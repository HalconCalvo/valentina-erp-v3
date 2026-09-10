"""add notes to accounts_payable for operational expense observations

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts_payable",
        sa.Column("notes", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("accounts_payable", "notes")
