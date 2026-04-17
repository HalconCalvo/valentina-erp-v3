"""add_lane_to_installation_assignment

Revision ID: 222e5e7b4ca0
Revises: f439b0d80c2b
Create Date: 2026-04-17 11:53:38.943519

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '222e5e7b4ca0'
down_revision: Union[str, Sequence[str], None] = 'f439b0d80c2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Solo `installation_assignments.lane` (IM / IP)."""
    with op.batch_alter_table('installation_assignments', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'lane',
                sa.String(),
                nullable=False,
                server_default='IM',
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('installation_assignments', schema=None) as batch_op:
        batch_op.drop_column('lane')
