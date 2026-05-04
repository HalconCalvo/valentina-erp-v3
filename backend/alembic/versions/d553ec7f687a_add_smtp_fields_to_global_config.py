"""add_smtp_fields_to_global_config

Revision ID: d553ec7f687a
Revises: 21ee1bca6d1d
Create Date: 2026-05-04 16:57:28.967975

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'd553ec7f687a'
down_revision: Union[str, Sequence[str], None] = '21ee1bca6d1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('global_config', schema=None) as batch_op:
        batch_op.add_column(sa.Column('smtp_email', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('smtp_password', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('smtp_host', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('global_config', schema=None) as batch_op:
        batch_op.drop_column('smtp_host')
        batch_op.drop_column('smtp_password')
        batch_op.drop_column('smtp_email')
