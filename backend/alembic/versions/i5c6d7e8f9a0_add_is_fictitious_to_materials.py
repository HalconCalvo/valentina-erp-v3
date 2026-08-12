"""add is_fictitious to materials

Revision ID: i5c6d7e8f9a0
Revises: h4b5c6d7e8f9
Create Date: 2026-08-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i5c6d7e8f9a0'
down_revision = 'h4b5c6d7e8f9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'materials',
        sa.Column('is_fictitious', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade():
    op.drop_column('materials', 'is_fictitious')
