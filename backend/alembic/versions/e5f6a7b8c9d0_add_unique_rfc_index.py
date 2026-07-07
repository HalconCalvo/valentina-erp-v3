"""add_unique_rfc_index

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-07 10:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Índice único PARCIAL y case-insensitive sobre rfc_tax_id: solo aplica a RFCs
    # no nulos y no vacíos. Es específico de PostgreSQL (expresión UPPER/TRIM +
    # WHERE); en SQLite local no se crea (la validación del endpoint cubre el caso).
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_rfc_norm
            ON clients_v2 (UPPER(TRIM(rfc_tax_id)))
            WHERE rfc_tax_id IS NOT NULL AND TRIM(rfc_tax_id) <> '';
        """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.execute("DROP INDEX IF EXISTS ux_clients_rfc_norm;")
