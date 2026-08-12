"""add credit_note_items table

Revision ID: j6d7e8f9a0b1
Revises: i5c6d7e8f9a0
Create Date: 2026-08-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j6d7e8f9a0b1'
down_revision = 'i5c6d7e8f9a0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'credit_note_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('credit_note_id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('returned_quantity', sa.Float(), nullable=False),
        sa.Column('unit_cost', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['credit_note_id'], ['credit_notes.id'], ),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        op.f('ix_credit_note_items_credit_note_id'),
        'credit_note_items', ['credit_note_id'], unique=False
    )


def downgrade():
    op.drop_index(op.f('ix_credit_note_items_credit_note_id'), table_name='credit_note_items')
    op.drop_table('credit_note_items')
