"""Gabriel 21/10–22/10: OV-0122 ZENARA invoices as they really were, and OV-0115 Luna is not an Excel OV.

- #44 cash progress 23/06/2025: $255,619.92 with $127,809.96 of advance amortized (it said $127,000.00, no amortization
  and invoice date 2026); #45 cash progress 11/09/2025: $214,767.04 with $107,383.52 amortized (it said $107,000.00).
  The cash collected was rounded ($127,000.00 / $107,000.00, payments untouched); the difference ($809.96 / $383.52)
  is a credit note "Descuento por redondeo en efectivo" linked to the invoice, so its balance is $0 without inventing
  a payment.
- #47 and #48 are invoices 492 and 594 (same type, date, amount and NC 116 / 138); they get their folio and, being
  covered by payment + amortized advance, they are PAID on the date of their payment.
- The order owes total − payments − credit notes = $342,577.00 (it said $21,619.92 from the first import).
- OV-0115 Luna was captured by hand on 11/09 (before the first Excel); it loses the "comes in the Excel" mark.
Each value changes only while it still has the value seen in production on 22/10; one audit row per field; the
downgrade restores them from the audit and removes the two credit notes.

Revision ID: 064478e54c17
Revises: 2ecb8aa6be05
Create Date: 2026-10-22
"""
from alembic import op

revision = "064478e54c17"
down_revision = "2ecb8aa6be05"
branch_labels = None
depends_on = None

CHANGE_ID = "zenara-064478e54c17"
REASON = "OV-0122 y OV-0115 con sus datos reales (Gabriel 21/10)"
ORDER_ID = 122
LUNA_ID = 115
ROUNDING_FOLIO = "REDONDEO-EFECTIVO"
ROUNDING_REASON = "Descuento por redondeo en efectivo"

# (table, record id, field, value it must still have, new value) — values as SQL literals
CHANGES = (
    ("customer_payments", 44, "amount", "127000", "255619.92"),
    ("customer_payments", 44, "amortized_advance", "0", "127809.96"),
    ("customer_payments", 44, "invoice_date", "'2026-06-23 00:00:00'", "'2025-06-23 00:00:00'"),
    ("customer_payments", 45, "amount", "107000", "214767.04"),
    ("customer_payments", 45, "amortized_advance", "0", "107383.52"),
    ("customer_payments", 47, "invoice_folio", None, "'492'"),
    ("customer_payments", 47, "status", "'PENDING'", "'PAID'"),
    ("customer_payments", 47, "payment_date", None, "'2026-04-10 00:00:00'"),
    ("customer_payments", 48, "invoice_folio", None, "'594'"),
    ("customer_payments", 48, "status", "'PENDING'", "'PAID'"),
    ("customer_payments", 48, "payment_date", None, "'2026-08-28 00:00:00'"),
    ("sales_orders", LUNA_ID, "is_excel_managed", "true", "false"),
)
# (invoice id, amount, date of the rounded cash payment)
ROUNDINGS = ((44, 809.96, "2025-06-23"), (45, 383.52, "2025-09-11"))
NEW_BALANCE = 342577.00


def _matches(field: str, expected) -> str:
    if expected is None:
        return f"COALESCE({field}::text, '') = ''"
    if field in ("amount", "amortized_advance"):
        return f"ABS({field} - {expected}) < 0.005"
    return f"{field} = {expected}"


def _change(table: str, record_id: int, field: str, expected, new_value: str) -> None:
    where = f"id = {record_id} AND {_matches(field, expected)}"
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', '{table}', id::text, 'UPDATE',
               '{field}', {field}::text, ({new_value})::text
        FROM {table} WHERE {where}
    """)
    op.execute(f"UPDATE {table} SET {field} = {new_value} WHERE {where}")


def _rounding_note(cxc_id: int, amount: float, day: str) -> None:
    op.execute(f"""
        INSERT INTO customer_credit_notes (sales_order_id, customer_payment_id, folio, note_date, amount, reason,
                                           status, created_at)
        SELECT {ORDER_ID}, {cxc_id}, '{ROUNDING_FOLIO}', '{day} 00:00:00', {amount}, '{ROUNDING_REASON}', 'ACTIVE',
               now() AT TIME ZONE 'utc'
        WHERE EXISTS (SELECT 1 FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'
                      AND table_name = 'customer_payments' AND record_id = '{cxc_id}' AND field_name = 'amount')
          AND NOT EXISTS (SELECT 1 FROM customer_credit_notes WHERE customer_payment_id = {cxc_id}
                          AND folio = '{ROUNDING_FOLIO}' AND status = 'ACTIVE')
    """)
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', 'customer_credit_notes', id::text,
               'INSERT', 'amount', NULL, amount::text
        FROM customer_credit_notes
        WHERE customer_payment_id = {cxc_id} AND folio = '{ROUNDING_FOLIO}' AND status = 'ACTIVE'
          AND id::text NOT IN (SELECT record_id FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'
                               AND table_name = 'customer_credit_notes')
    """)


def upgrade() -> None:
    for table, record_id, field, expected, new_value in CHANGES:
        _change(table, record_id, field, expected, new_value)
    for cxc_id, amount, day in ROUNDINGS:
        _rounding_note(cxc_id, amount, day)
    # Only when the invoices were corrected here: what the order still owes after payments and credit notes
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', 'sales_orders', id::text, 'UPDATE',
               'outstanding_balance', outstanding_balance::text, '{NEW_BALANCE}'
        FROM sales_orders
        WHERE id = {ORDER_ID} AND ABS(outstanding_balance - {NEW_BALANCE}) > 0.005
          AND EXISTS (SELECT 1 FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'
                      AND table_name = 'customer_credit_notes')
    """)
    op.execute(f"""
        UPDATE sales_orders SET outstanding_balance = {NEW_BALANCE}
        WHERE id = {ORDER_ID} AND id::text IN (SELECT record_id FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'
                                                AND table_name = 'sales_orders' AND field_name = 'outstanding_balance')
    """)


def _restore(table: str, field: str, cast: str) -> None:
    op.execute(f"""
        UPDATE {table} t SET {field} = a.old_value::{cast}
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.table_name = '{table}' AND a.field_name = '{field}'
          AND a.record_id = t.id::text
    """)


def downgrade() -> None:
    for field, cast in (("amount", "double precision"), ("amortized_advance", "double precision"),
                        ("invoice_date", "timestamp"), ("invoice_folio", "varchar"), ("status", "cxcstatus"),
                        ("payment_date", "timestamp")):
        _restore("customer_payments", field, cast)
    _restore("sales_orders", "is_excel_managed", "boolean")
    _restore("sales_orders", "outstanding_balance", "double precision")
    op.execute(f"""
        DELETE FROM customer_credit_notes WHERE id::text IN (
            SELECT record_id FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'
            AND table_name = 'customer_credit_notes')
    """)
    op.execute(f"DELETE FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'")
