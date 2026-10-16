"""H65/D37/H66: commissions and installer payroll record how they were paid: BANK (account and movement) or CASH
(petty cash movement), when and by whom. One movement may pay several payroll rows of a person.

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "z5a6b7c8d9e0"
down_revision = "y4z5a6b7c8d9"
branch_labels = None
depends_on = None

COLUMNS = {
    "sales_commissions": [("paid_at", sa.DateTime(), None), ("paid_by_user_id", sa.Integer(), "users"),
                          ("payment_method", sa.String(), None), ("bank_transaction_id", sa.Integer(), "bank_transactions"),
                          ("petty_cash_movement_id", sa.Integer(), "petty_cash_movements")],
    "payroll_payments": [("payment_method", sa.String(), None),
                         ("bank_transaction_id", sa.Integer(), "bank_transactions"),
                         ("petty_cash_movement_id", sa.Integer(), "petty_cash_movements"),
                         ("paid_by_user_id", sa.Integer(), "users")],
}


def upgrade() -> None:
    for table, columns in COLUMNS.items():
        for name, kind, target in columns:
            op.add_column(table, sa.Column(name, kind, nullable=True))
            if target:
                op.create_foreign_key(f"fk_{table}_{name}", table, target, [name], ["id"])
    # Installer payments already paid through a bank account were bank payments
    op.execute("UPDATE payroll_payments SET payment_method = 'BANK' WHERE status = 'PAID' AND bank_account_id IS NOT NULL")


def downgrade() -> None:
    for table, columns in COLUMNS.items():
        for name, _, target in reversed(columns):
            if target:
                op.drop_constraint(f"fk_{table}_{name}", table, type_="foreignkey")
            op.drop_column(table, name)
