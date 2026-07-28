"""add_resale_fields_to_materials

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-28 11:34:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'materials',
        sa.Column('is_resale', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'materials',
        sa.Column('sale_price', sa.Float(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('materials', 'sale_price')
    op.drop_column('materials', 'is_resale')
