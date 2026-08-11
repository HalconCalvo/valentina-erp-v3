"""add credit_notes table

Revision ID: g3a4b5c6d7e8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-11 13:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g3a4b5c6d7e8'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'credit_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('purchase_invoice_id', sa.Integer(), nullable=False),
        sa.Column('accounts_payable_id', sa.Integer(), nullable=True),
        sa.Column('provider_id', sa.Integer(), nullable=False),
        sa.Column('folio', sa.String(), nullable=False),
        sa.Column('uuid_sat', sa.String(), nullable=True),
        sa.Column('credit_type', sa.String(), nullable=False, server_default='PRICE_ADJUSTMENT'),
        sa.Column('subtotal', sa.Float(), nullable=False, server_default='0'),
        sa.Column('tax_rate', sa.Float(), nullable=False, server_default='0.16'),
        sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_amount', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['purchase_invoice_id'], ['purchase_invoices.id'], ),
        sa.ForeignKeyConstraint(['accounts_payable_id'], ['accounts_payable.id'], ),
        sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_credit_notes_purchase_invoice_id'), 'credit_notes', ['purchase_invoice_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_credit_notes_purchase_invoice_id'), table_name='credit_notes')
    op.drop_table('credit_notes')
