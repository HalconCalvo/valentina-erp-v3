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
    op.execute("""
        ALTER TABLE global_config 
        ADD COLUMN IF NOT EXISTS smtp_email VARCHAR,
        ADD COLUMN IF NOT EXISTS smtp_password VARCHAR,
        ADD COLUMN IF NOT EXISTS smtp_host VARCHAR DEFAULT 'smtp.gmail.com'
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE global_config 
        DROP COLUMN IF EXISTS smtp_email,
        DROP COLUMN IF EXISTS smtp_password,
        DROP COLUMN IF EXISTS smtp_host
    """)
