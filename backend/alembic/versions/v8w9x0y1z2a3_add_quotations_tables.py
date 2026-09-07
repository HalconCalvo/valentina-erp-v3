"""add quotations and quotation_items tables

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "v8w9x0y1z2a3"
down_revision: Union[str, Sequence[str], None] = "u7v8w9x0y1z2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

quotation_status = sa.Enum(
    "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED",
    name="quotationstatus",
)


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE quotationstatus AS ENUM "
        "('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'); "
        "EXCEPTION WHEN duplicate_object THEN null; "
        "END $$;"
    )

    op.create_table(
        "quotations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("tax_rate_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("project_name", sa.String(), nullable=False),
        sa.Column("status", quotation_status, nullable=False, server_default="DRAFT"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("valid_until", sa.DateTime(), nullable=False),
        sa.Column("delivery_date", sa.DateTime(), nullable=True),
        sa.Column("applied_margin_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("applied_tolerance_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("applied_commission_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("commission_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("advance_percent", sa.Float(), nullable=False, server_default="60"),
        sa.Column("has_advance_invoice", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("advance_invoice_amount", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(), nullable=False, server_default="MXN"),
        sa.Column("exchange_rate", sa.Float(), nullable=True, server_default="1"),
        sa.Column("estimated_installation_cost", sa.Float(), nullable=True, server_default="0"),
        sa.Column("estimated_manufacturing_cost", sa.Float(), nullable=True, server_default="0"),
        sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("conditions", sa.String(), nullable=True),
        sa.Column("external_invoice_ref", sa.String(), nullable=True),
        sa.Column("is_warranty", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_reason", sa.String(), nullable=True),
        sa.Column("cancelled_by_user_id", sa.Integer(), nullable=True),
        sa.Column("sales_order_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["cancelled_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["client_id"], ["clients_v2.id"]),
        sa.ForeignKeyConstraint(["tax_rate_id"], ["tax_rates.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quotations_project_name"), "quotations", ["project_name"], unique=False)

    op.create_table(
        "quotation_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(), nullable=False),
        sa.Column("origin_version_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("subtotal_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cost_snapshot", sa.JSON(), nullable=True),
        sa.Column("frozen_unit_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_resale", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resale_sku", sa.String(), nullable=True),
        sa.Column("commercial_description", sa.String(), nullable=True),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("sales_orders", sa.Column("quotation_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_sales_orders_quotation_id",
        "sales_orders",
        "quotations",
        ["quotation_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_quotations_sales_order_id",
        "quotations",
        "sales_orders",
        ["sales_order_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_quotations_sales_order_id", "quotations", type_="foreignkey")
    op.drop_constraint("fk_sales_orders_quotation_id", "sales_orders", type_="foreignkey")
    op.drop_column("sales_orders", "quotation_id")
    op.drop_table("quotation_items")
    op.drop_index(op.f("ix_quotations_project_name"), table_name="quotations")
    op.drop_table("quotations")
    op.execute("DROP TYPE IF EXISTS quotationstatus")
