"""add previous_material_cost to credit_notes

Revision ID: h4b5c6d7e8f9
Revises: g3a4b5c6d7e8
Create Date: 2026-08-11 16:52:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h4b5c6d7e8f9'
down_revision: Union[str, Sequence[str], None] = 'g3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('credit_notes', sa.Column('previous_material_cost', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('credit_notes', 'previous_material_cost')
