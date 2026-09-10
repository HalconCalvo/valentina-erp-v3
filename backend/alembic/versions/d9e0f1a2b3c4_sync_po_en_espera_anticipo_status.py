"""sync purchase order status for pending supplier advances

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("""
            UPDATE purchase_orders po
            SET status = 'EN_ESPERA_ANTICIPO', is_advance = TRUE
            FROM purchase_invoices pi
            WHERE pi.invoice_number = 'ANT-' || po.folio
              AND pi.status = 'PENDING'
              AND pi.outstanding_balance > 0
              AND UPPER(COALESCE(po.status, '')) = 'AUTORIZADA'
        """)
    )


def downgrade() -> None:
    pass
