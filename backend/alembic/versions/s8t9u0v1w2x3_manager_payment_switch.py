"""Switch that lets MANAGER execute payments (off by default; only DIRECTOR changes it).

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op

revision = "s8t9u0v1w2x3"
down_revision = "r7s8t9u0v1w2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("global_config")}
    if "manager_can_execute_payments" not in existing:
        with op.batch_alter_table("global_config") as batch:
            batch.add_column(sa.Column("manager_can_execute_payments", sa.Boolean(), nullable=False,
                                       server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("global_config") as batch:
        batch.drop_column("manager_can_execute_payments")
