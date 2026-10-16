"""H56: label and stone manifest requests stay in the print center until downloaded (requested / printed, by whom).

Backfill: houses with a pending lane (installation assignment not loaded) whose labels were never generated count as
requested, so Piloto 2 and 3 (OV-0157) come back; old houses without lanes stay out, as before.

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "y4z5a6b7c8d9"
down_revision = "x3y4z5a6b7c8"
branch_labels = None
depends_on = None

TABLE = "sales_order_item_instances"
KINDS = (("labels", "declared_bundles", "IM"), ("manifest", "stone_pieces", "IP"))


def upgrade() -> None:
    for kind, _, _ in KINDS:
        op.add_column(TABLE, sa.Column(f"{kind}_requested_at", sa.DateTime(), nullable=True))
        op.add_column(TABLE, sa.Column(f"{kind}_printed_at", sa.DateTime(), nullable=True))
        op.add_column(TABLE, sa.Column(f"{kind}_printed_by_user_id", sa.Integer(), nullable=True))
        op.create_foreign_key(f"fk_{TABLE}_{kind}_printed_by", TABLE, "users", [f"{kind}_printed_by_user_id"], ["id"])
    for kind, count_column, lane in KINDS:
        op.execute(sa.text(f"""
            UPDATE {TABLE} i SET {kind}_requested_at = now()
            WHERE i.is_cancelled = false AND coalesce(i.{count_column}, 0) > 0 AND i.qr_code IS NULL
              AND EXISTS (SELECT 1 FROM installation_assignments a
                          WHERE a.instance_id = i.id AND a.lane = '{lane}' AND a.status = 'SCHEDULED')
        """))


def downgrade() -> None:
    for kind, _, _ in KINDS:
        op.drop_constraint(f"fk_{TABLE}_{kind}_printed_by", TABLE, type_="foreignkey")
        for column in ("printed_by_user_id", "printed_at", "requested_at"):
            op.drop_column(TABLE, f"{kind}_{column}")
