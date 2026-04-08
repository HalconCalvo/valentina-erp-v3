"""Rescate de tabla Accounts Payable

Revision ID: f27fb3fb368d
Revises: 48250b0dd5d6
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = 'f27fb3fb368d'
down_revision: Union[str, Sequence[str], None] = '48250b0dd5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass