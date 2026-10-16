"""D39 (Gabriel, 16/10): every commission existing before this release was already paid outside Valentina. They are
marked paid with method OUTSIDE ("Pagada fuera de Valentina"), without any bank or petty cash movement, with one audit
row per field and the reason "D39: pagada antes de Valentina". The pilot job (client OBRA PILOTO, only in Pruebas)
keeps its commissions to test the normal flow. New commissions follow Por pagar → Pagar.

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-10-16
"""
from alembic import op

revision = "a6b7c8d9e0f1"
down_revision = "z5a6b7c8d9e0"
branch_labels = None
depends_on = None

CHANGE_ID = "d39-a6b7c8d9e0f1"
REASON = "D39: pagada antes de Valentina"
PILOT_CLIENT = "OBRA PILOTO"


def upgrade() -> None:
    op.execute(f"""
        CREATE TEMP TABLE d39_rows ON COMMIT DROP AS
        SELECT c.id FROM sales_commissions c
        JOIN customer_payments p ON p.id = c.customer_payment_id
        JOIN sales_orders o ON o.id = p.sales_order_id
        LEFT JOIN clients_v2 cl ON cl.id = o.client_id
        WHERE NOT c.is_paid AND COALESCE(cl.full_name, '') <> '{PILOT_CLIENT}'
    """)
    for field, old, new in (("is_paid", "false", "true"), ("payment_method", None, "OUTSIDE")):
        old_sql = f"'{old}'" if old else "NULL"
        op.execute(f"""
            INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                             field_name, old_value, new_value)
            SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', 'sales_commissions', id::text,
                   'UPDATE', '{field}', {old_sql}, '{new}'
            FROM d39_rows
        """)
    op.execute("""
        UPDATE sales_commissions SET is_paid = true, payment_method = 'OUTSIDE', paid_at = now() AT TIME ZONE 'utc'
        WHERE id IN (SELECT id FROM d39_rows)
    """)


def downgrade() -> None:
    op.execute(f"""
        UPDATE sales_commissions SET is_paid = false, payment_method = NULL, paid_at = NULL
        WHERE payment_method = 'OUTSIDE'
          AND id::text IN (SELECT record_id FROM audit_field_changes WHERE change_id = '{CHANGE_ID}')
    """)
    op.execute(f"DELETE FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'")
