"""Cancel instead of delete: petty cash movements and supplier payment requests.

Revision ID: r7s8t9u0v1w2
Revises: n4o5p6q7r8s9
Create Date: 2026-10-10

- petty_cash_movements: is_cancelled (default false), cancel_reason, cancelled_at, cancelled_by_id.
- paymentstatus enum: new value CANCELLED (a payment request cancelled by whoever asked for it).
Downgrade drops the columns; the enum value stays (PostgreSQL cannot drop enum values).
"""
import sqlalchemy as sa
from alembic import op

revision = "r7s8t9u0v1w2"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None

TABLE = "petty_cash_movements"


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}
    with op.batch_alter_table(TABLE) as batch:
        if "is_cancelled" not in existing:
            batch.add_column(sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "cancel_reason" not in existing:
            batch.add_column(sa.Column("cancel_reason", sa.String(), nullable=True))
        if "cancelled_at" not in existing:
            batch.add_column(sa.Column("cancelled_at", sa.DateTime(), nullable=True))
        if "cancelled_by_id" not in existing:
            batch.add_column(sa.Column("cancelled_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    with op.batch_alter_table(TABLE) as batch:
        batch.drop_column("cancelled_by_id")
        batch.drop_column("cancelled_at")
        batch.drop_column("cancel_reason")
        batch.drop_column("is_cancelled")
