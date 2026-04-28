"""add_instance_id_to_accounts_payable

Revision ID: 2b1af81e3f31
Revises: 9168e4aad43e
Create Date: 2026-04-28 12:28:11.264035

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '2b1af81e3f31'
down_revision: Union[str, Sequence[str], None] = '9168e4aad43e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts_payable',
        sa.Column('instance_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('accounts_payable', 'instance_id')
