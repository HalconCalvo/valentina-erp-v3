"""add active_sessions table for single-session enforcement

Revision ID: f7g8h9i0j1k2
Revises: e0f1a2b3c4d5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f7g8h9i0j1k2"
down_revision: Union[str, Sequence[str], None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "active_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_token", sa.String(), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_heartbeat", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        op.f("ix_active_sessions_session_token"),
        "active_sessions",
        ["session_token"],
        unique=False,
    )
    op.create_index(
        op.f("ix_active_sessions_user_id"),
        "active_sessions",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_active_sessions_user_id"), table_name="active_sessions")
    op.drop_index(op.f("ix_active_sessions_session_token"), table_name="active_sessions")
    op.drop_table("active_sessions")
