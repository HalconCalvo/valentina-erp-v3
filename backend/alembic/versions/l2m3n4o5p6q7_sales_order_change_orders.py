"""Sales order change orders (CAM), logical cancellation of lines, complementary OV and client credit notes.

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-10-08

- quotations: kind (NEW / CHANGE_ORDER), parent sales order, change number and reason, apply data,
  optional client PO of the change and the complementary advance it requires.
- quotation_items: change order operation (type, target line, units to cancel, reversal dispositions, reason).
- sales_order_items / sales_order_item_instances: logical cancellation (who, when, why) and the change order
  that created or changed them.
- sales_orders: parent order of a complementary OV.
- customer_payments: change order of a complementary advance invoice.
- customer_credit_notes: credit notes to clients captured from Compaq.
No data is copied; existing rows keep their meaning (kind NEW, nothing cancelled).
"""
import sqlalchemy as sa
from alembic import op

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def _cancellation_columns() -> list:
    return [
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancel_reason", sa.String(), nullable=True),
        sa.Column("change_quotation_id", sa.Integer(), sa.ForeignKey("quotations.id"), nullable=True),
    ]


def _quotation_columns() -> list:
    return [
        sa.Column("kind", sa.String(), nullable=False, server_default="NEW"),
        sa.Column("parent_sales_order_id", sa.Integer(), sa.ForeignKey("sales_orders.id"), nullable=True),
        sa.Column("change_number", sa.Integer(), nullable=True),
        sa.Column("change_reason", sa.String(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("client_po_folio", sa.String(), nullable=True),
        sa.Column("client_po_date", sa.DateTime(), nullable=True),
        sa.Column("complementary_advance_amount", sa.Float(), nullable=False, server_default="0"),
    ]


def _quotation_item_columns() -> list:
    return [
        sa.Column("change_type", sa.String(), nullable=True),
        sa.Column("target_order_item_id", sa.Integer(), sa.ForeignKey("sales_order_items.id"), nullable=True),
        sa.Column("cancel_instance_ids", sa.JSON(), nullable=True),
        sa.Column("reversal_dispositions", sa.JSON(), nullable=True),
        sa.Column("change_reason", sa.String(), nullable=True),
    ]


def _add(table: str, columns: list) -> None:
    with op.batch_alter_table(table) as batch:
        for column in columns:
            batch.add_column(column)


def _drop(table: str, names: list) -> None:
    with op.batch_alter_table(table) as batch:
        for name in names:
            batch.drop_column(name)


def upgrade() -> None:
    _add("quotations", _quotation_columns())
    _add("quotation_items", _quotation_item_columns())
    _add("sales_order_items", [sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false())]
         + _cancellation_columns())
    _add("sales_order_item_instances", _cancellation_columns())
    _add("sales_orders", [sa.Column("parent_sales_order_id", sa.Integer(), sa.ForeignKey("sales_orders.id"),
                                    nullable=True)])
    _add("customer_payments", [sa.Column("change_quotation_id", sa.Integer(), sa.ForeignKey("quotations.id"),
                                         nullable=True)])
    if sa.inspect(op.get_bind()).has_table("customer_credit_notes"):
        return  # created by the app's create_all on a dev database; same columns and indexes
    op.create_table(
        "customer_credit_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_order_id", sa.Integer(), sa.ForeignKey("sales_orders.id"), nullable=False),
        sa.Column("customer_payment_id", sa.Integer(), sa.ForeignKey("customer_payments.id"), nullable=True),
        sa.Column("change_quotation_id", sa.Integer(), sa.ForeignKey("quotations.id"), nullable=True),
        sa.Column("folio", sa.String(), nullable=False),
        sa.Column("note_date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancel_reason", sa.String(), nullable=True),
    )
    op.create_index("ix_customer_credit_notes_sales_order_id", "customer_credit_notes", ["sales_order_id"])
    op.create_index("ix_customer_credit_notes_customer_payment_id", "customer_credit_notes", ["customer_payment_id"])


def downgrade() -> None:
    op.drop_index("ix_customer_credit_notes_customer_payment_id", table_name="customer_credit_notes")
    op.drop_index("ix_customer_credit_notes_sales_order_id", table_name="customer_credit_notes")
    op.drop_table("customer_credit_notes")
    _drop("customer_payments", ["change_quotation_id"])
    _drop("sales_orders", ["parent_sales_order_id"])
    _drop("sales_order_item_instances", ["cancelled_at", "cancelled_by_user_id", "cancel_reason", "change_quotation_id"])
    _drop("sales_order_items", ["is_cancelled", "cancelled_at", "cancelled_by_user_id", "cancel_reason",
                                "change_quotation_id"])
    _drop("quotation_items", [c.name for c in _quotation_item_columns()])
    _drop("quotations", [c.name for c in _quotation_columns()])
