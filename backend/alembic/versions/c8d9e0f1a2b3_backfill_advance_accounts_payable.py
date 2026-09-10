"""backfill accounts_payable for advance invoices 359 and 360

Revision ID: c8d9e0f1a2b3
Revises: b6c7d8e9f0a1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("""
            SELECT id, provider_id, invoice_number, total_amount, due_date, issue_date
            FROM purchase_invoices
            WHERE id IN (359, 360)
              AND (accounts_payable_id IS NULL OR accounts_payable_id = 0)
        """)
    ).fetchall()

    for inv_id, provider_id, invoice_number, total_amount, due_date, issue_date in rows:
        po_row = conn.execute(
            sa.text("""
                SELECT id
                FROM purchase_orders
                WHERE folio = :folio
                LIMIT 1
            """),
            {"folio": str(invoice_number).replace("ANT-", "", 1)},
        ).first()
        purchase_order_id = po_row[0] if po_row else None

        existing_ap = conn.execute(
            sa.text("""
                SELECT id
                FROM accounts_payable
                WHERE invoice_folio = :folio
                  AND provider_id = :provider_id
                  AND status != 'CANCELADO'
                LIMIT 1
            """),
            {"folio": invoice_number, "provider_id": provider_id},
        ).first()

        if existing_ap:
            ap_id = existing_ap[0]
        else:
            ap_due = due_date or issue_date
            inserted = conn.execute(
                sa.text("""
                    INSERT INTO accounts_payable (
                        provider_id, purchase_order_id, invoice_folio,
                        total_amount, subtotal, tax_rate, tax_amount,
                        due_date, status, created_at
                    ) VALUES (
                        :provider_id, :purchase_order_id, :invoice_folio,
                        :total_amount, :total_amount, 0.0, 0.0,
                        :due_date, 'PENDIENTE', CURRENT_TIMESTAMP
                    )
                    RETURNING id
                """),
                {
                    "provider_id": provider_id,
                    "purchase_order_id": purchase_order_id,
                    "invoice_folio": invoice_number,
                    "total_amount": total_amount,
                    "due_date": ap_due,
                },
            ).first()
            ap_id = inserted[0]

        conn.execute(
            sa.text("""
                UPDATE purchase_invoices
                SET accounts_payable_id = :ap_id
                WHERE id = :inv_id
            """),
            {"ap_id": ap_id, "inv_id": inv_id},
        )


def downgrade() -> None:
    pass
