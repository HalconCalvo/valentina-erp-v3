"""D16: a customer invoice or sales order whose balance is at most this amount counts as paid (only DIRECTOR
changes it; initial 1.00).

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-10-12
"""
import sqlalchemy as sa
from alembic import op

revision = "v1w2x3y4z5a6"
down_revision = "u0v1w2x3y4z5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("global_config", sa.Column("paid_balance_tolerance", sa.Float(), nullable=False,
                                             server_default="1.00"))


def downgrade() -> None:
    op.drop_column("global_config", "paid_balance_tolerance")
