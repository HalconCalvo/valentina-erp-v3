"""fix_blueprint_path_and_dead_status_in_prod

Revision ID: 5910cd671a93
Revises: 2b1af81e3f31
Create Date: 2026-04-28 18:11:22.056663

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '5910cd671a93'
down_revision: Union[str, Sequence[str], None] = '2b1af81e3f31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    columns = [col['name'] for col in inspector.get_columns('design_product_versions')]

    if 'blueprint_path' not in columns:
        op.add_column('design_product_versions',
            sa.Column('blueprint_path', sa.String(), nullable=True))

    if bind.dialect.name == 'postgresql':
        op.execute("ALTER TYPE productionbatchstatus ADD VALUE IF NOT EXISTS 'DEAD'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        op.drop_column('design_product_versions', 'blueprint_path')