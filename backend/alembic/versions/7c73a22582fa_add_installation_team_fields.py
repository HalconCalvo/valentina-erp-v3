"""add_installation_team_fields

Revision ID: 7c73a22582fa
Revises: 8391f4b4c2f0
Create Date: 2026-04-17 10:22:31.004664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c73a22582fa'
down_revision: Union[str, Sequence[str], None] = '8391f4b4c2f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — solo `installation_assignments`."""
    with op.batch_alter_table('installation_assignments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('helper_1_user_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('helper_2_user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_installation_assignments_helper_1_user_id_users',
            'users',
            ['helper_1_user_id'],
            ['id'],
        )
        batch_op.create_foreign_key(
            'fk_installation_assignments_helper_2_user_id_users',
            'users',
            ['helper_2_user_id'],
            ['id'],
        )
        batch_op.drop_column('helper_user_id')


def downgrade() -> None:
    """Downgrade schema — solo `installation_assignments`."""
    with op.batch_alter_table('installation_assignments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('helper_user_id', sa.INTEGER(), nullable=True))
        batch_op.create_foreign_key(
            'fk_installation_assignments_helper_user_id_users',
            'users',
            ['helper_user_id'],
            ['id'],
        )
        batch_op.drop_constraint('fk_installation_assignments_helper_2_user_id_users', type_='foreignkey')
        batch_op.drop_constraint('fk_installation_assignments_helper_1_user_id_users', type_='foreignkey')
        batch_op.drop_column('helper_2_user_id')
        batch_op.drop_column('helper_1_user_id')
