"""Gabriel 23/10: OV-0123 and OV-0124 of PROMOTORA VIVEYUC are zero rate (the Excel import left them at 16%).

The total with IVA and what was collected do not change: subtotal = total, IVA = 0, and the "Contrato legacy" line takes
the whole total. The commission of the order (commission_amount) stays as it is: it was already paid outside Valentina
(Gabriel 23/10), so no difference or new commission is generated. Invoices (customer_payments) carry no rate.
Each value changes only while it still has the value seen in production on 23/10; one audit row per field; the
downgrade restores them from the audit.

Revision ID: fb91a5ebd149
Revises: 064478e54c17
Create Date: 2026-10-23
"""
from alembic import op

revision = "fb91a5ebd149"
down_revision = "064478e54c17"
branch_labels = None
depends_on = None

CHANGE_ID = "viveyuc-fb91a5ebd149"
REASON = "PROMOTORA VIVEYUC es Tasa Cero: OV-0123 y OV-0124 sin IVA (Gabriel 23/10)"
ZERO_RATE_ID = 3  # "Tasa Cero", 0%
STANDARD_RATE_ID = 1

# (table, record id, field, value it must still have, new value)
CHANGES = (
    ("sales_orders", 123, "tax_rate_id", STANDARD_RATE_ID, ZERO_RATE_ID),
    ("sales_orders", 123, "subtotal", 2259450.86, 2620963.00),
    ("sales_orders", 123, "tax_amount", 361512.14, 0),
    ("sales_order_items", 1849, "unit_price", 2259450.86, 2620963.00),
    ("sales_order_items", 1849, "subtotal_price", 2259450.86, 2620963.00),
    ("sales_orders", 124, "tax_rate_id", STANDARD_RATE_ID, ZERO_RATE_ID),
    ("sales_orders", 124, "subtotal", 135819.83, 157551.00),
    ("sales_orders", 124, "tax_amount", 21731.17, 0),
    ("sales_order_items", 1850, "unit_price", 135819.83, 157551.00),
    ("sales_order_items", 1850, "subtotal_price", 135819.83, 157551.00),
)
# The rate must be 0% for the change to make sense
GUARD = f"EXISTS (SELECT 1 FROM tax_rates WHERE id = {ZERO_RATE_ID} AND rate = 0)"


def _change(table: str, record_id: int, field: str, expected, new_value) -> None:
    where = f"id = {record_id} AND ABS({field} - {expected}) < 0.005 AND {GUARD}"
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', '{table}', id::text, 'UPDATE',
               '{field}', {field}::text, '{new_value}'
        FROM {table} WHERE {where}
    """)
    op.execute(f"UPDATE {table} SET {field} = {new_value} WHERE {where}")


def upgrade() -> None:
    for table, record_id, field, expected, new_value in CHANGES:
        _change(table, record_id, field, expected, new_value)


def _restore(table: str, field: str, cast: str) -> None:
    op.execute(f"""
        UPDATE {table} t SET {field} = a.old_value::{cast}
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.table_name = '{table}' AND a.field_name = '{field}'
          AND a.record_id = t.id::text
    """)


def downgrade() -> None:
    _restore("sales_orders", "tax_rate_id", "integer")
    for field in ("subtotal", "tax_amount"):
        _restore("sales_orders", field, "double precision")
    for field in ("unit_price", "subtotal_price"):
        _restore("sales_order_items", field, "double precision")
    op.execute(f"DELETE FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'")
