"""add purchase_prepayments table

Revision ID: l8f9a0b1c2d3
Revises: k7e8f9a0b1c2
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa


revision = 'l8f9a0b1c2d3'
down_revision = 'k7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade():
    # Tabla puede existir ya en producción (fue creada manualmente antes del revert)
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_prepayments (
            id SERIAL NOT NULL PRIMARY KEY,
            purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
            provider_id INTEGER NOT NULL REFERENCES providers(id),
            amount FLOAT NOT NULL,
            payment_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            reference VARCHAR,
            bank_account VARCHAR,
            notes VARCHAR,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            created_by_user_id INTEGER REFERENCES users(id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_prepayments_purchase_order_id ON purchase_prepayments (purchase_order_id)")
    return  # el resto del upgrade original ya no aplica


def downgrade():
    op.drop_table('purchase_prepayments')
