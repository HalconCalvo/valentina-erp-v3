"""The production route decides which materials hold stock: drop materials.is_inventoriable.

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-10-10

Only MATERIAL holds stock (counted, valued, reserved). The separate flag said the same thing as the route and
could contradict it, so it is removed. The change log already recorded is kept as is; excluded audit lines and
EXPENSE_WRITE_OFF movements stay.
"""
import sqlalchemy as sa
from alembic import op

revision = "q6r7s8t9u0v1"
down_revision = "p5q6r7s8t9u0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "is_inventoriable" in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("materials")}:
        with op.batch_alter_table("materials") as batch:
            batch.drop_column("is_inventoriable")


def downgrade() -> None:
    with op.batch_alter_table("materials") as batch:
        batch.add_column(sa.Column("is_inventoriable", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE materials SET is_inventoriable = (CAST(production_route AS VARCHAR) = 'MATERIAL')")
