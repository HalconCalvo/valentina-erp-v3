"""Status CANCELLED for production batches (draft stopped with a reason) and payroll payments (team change
before signature) instead of deleting them.

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-10-10
"""
from alembic import op

revision = "u0v1w2x3y4z5"
down_revision = "t9u0v1w2x3y4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE productionbatchstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")
        op.execute("ALTER TYPE payrollstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value; cancelled batches would keep it.
    pass
