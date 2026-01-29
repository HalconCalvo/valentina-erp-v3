"""add_purchase_invoices_table

Revision ID: 31d5db17dbed
Revises: ffe2886964b2
Create Date: 2024-XX-XX ...

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision = '31d5db17dbed'
down_revision = 'ffe2886964b2'
branch_labels = None
depends_on = None


def upgrade():
    # --- MANTÉN SOLO ESTE BLOQUE ---
    op.create_table('purchase_invoices',
    sa.Column('reception_id', sa.Integer(), nullable=False),
    sa.Column('provider_id', sa.Integer(), nullable=False),
    sa.Column('invoice_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('total_amount', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('due_date', sa.DateTime(), nullable=False),
    sa.Column('payment_status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('outstanding_balance', sa.Float(), nullable=False),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ),
    sa.ForeignKeyConstraint(['reception_id'], ['inventory_receptions.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reception_id')
    )
    op.create_index(op.f('ix_purchase_invoices_invoice_uuid'), 'purchase_invoices', ['invoice_uuid'], unique=False)
    # --- BORRA TODO LO DEMÁS QUE ESTÉ ABAJO DENTRO DE ESTA FUNCIÓN ---


def downgrade():
    # SI QUIERES, PUEDES DEJAR ESTO LIMPIO TAMBIÉN
    op.drop_index(op.f('ix_purchase_invoices_invoice_uuid'), table_name='purchase_invoices')
    op.drop_table('purchase_invoices')