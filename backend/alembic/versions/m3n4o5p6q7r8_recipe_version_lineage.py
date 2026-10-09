"""Recipe correction lineage on product versions.

Revision ID: m3n4o5p6q7r8
Revises: q6r7s8t9u0v1
Create Date: 2026-10-09

A recipe already used is never edited in place: the Director's correction creates a new version that
replaces the old one (which becomes OBSOLETE and keeps its components for what was already sold).
"""
import sqlalchemy as sa
from alembic import op

revision = "m3n4o5p6q7r8"
down_revision = "q6r7s8t9u0v1"
branch_labels = None
depends_on = None


def _columns() -> list:
    return [
        sa.Column("replaces_version_id", sa.Integer(), sa.ForeignKey("design_product_versions.id"), nullable=True),
        sa.Column("correction_note", sa.String(), nullable=True),
        sa.Column("corrected_at", sa.DateTime(), nullable=True),
        sa.Column("corrected_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("corrected_in_quotation_id", sa.Integer(), sa.ForeignKey("quotations.id"), nullable=True),
    ]


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("design_product_versions")}
    with op.batch_alter_table("design_product_versions") as batch:
        for column in _columns():
            if column.name not in existing:  # a dev database may already have them (create_all)
                batch.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("design_product_versions") as batch:
        for column in _columns():
            batch.drop_column(column.name)
