"""D44/D39 (Gabriel 19/10 13:03): global commissions of anyone other than the configured beneficiary come from the old
rule (every DIRECTOR with a rate → duplicated). They are "Omitida" (payroll_deferred + reason), not paid: the ones D39
marked "Pagada fuera de Valentina" go back to unpaid and are omitted too. One audit row per field. Runs after D39 and
after D44 seeded the beneficiary; without a beneficiary it does nothing.

Revision ID: dcab654921ee
Revises: 969c63689777
Create Date: 2026-10-19
"""
from alembic import op

revision = "dcab654921ee"
down_revision = "969c63689777"
branch_labels = None
depends_on = None

CHANGE_ID = "d44-omit-dcab654921ee"
D39_CHANGE_ID = "d39-a6b7c8d9e0f1"
REASON = "Cálculo anterior duplicado (antes de D44)"


def _audit(field: str, old_sql: str, new_sql: str, where: str = "TRUE") -> None:
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', 'sales_commissions', id::text,
               'UPDATE', '{field}', {old_sql}, {new_sql}
        FROM d44_rows WHERE {where}
    """)


def upgrade() -> None:
    op.execute(f"""
        CREATE TEMP TABLE d44_rows ON COMMIT DROP AS
        SELECT c.id, c.admin_notes,
               (c.is_paid AND c.payment_method = 'OUTSIDE'
                AND c.id::text IN (SELECT record_id FROM audit_field_changes WHERE change_id = '{D39_CHANGE_ID}')) AS by_d39
        FROM sales_commissions c, global_config g
        WHERE c.commission_type = 'DIRECTOR_GLOBAL' AND g.global_commission_user_id IS NOT NULL
          AND c.user_id <> g.global_commission_user_id AND NOT c.payroll_deferred
          AND (NOT c.is_paid OR c.payment_method = 'OUTSIDE')
    """)
    op.execute("DELETE FROM d44_rows WHERE id IN (SELECT id FROM sales_commissions WHERE is_paid) AND NOT by_d39")
    _audit("is_paid", "'true'", "'false'", "by_d39")
    _audit("payment_method", "'OUTSIDE'", "NULL", "by_d39")
    _audit("payroll_deferred", "'false'", "'true'")
    _audit("admin_notes", "admin_notes", f"'{REASON}' || COALESCE(' · ' || admin_notes, '')")
    op.execute(f"""
        UPDATE sales_commissions c SET
            is_paid = CASE WHEN r.by_d39 THEN false ELSE c.is_paid END,
            payment_method = CASE WHEN r.by_d39 THEN NULL ELSE c.payment_method END,
            paid_at = CASE WHEN r.by_d39 THEN NULL ELSE c.paid_at END,
            payroll_deferred = true,
            admin_notes = '{REASON}' || COALESCE(' · ' || c.admin_notes, '')
        FROM d44_rows r WHERE r.id = c.id
    """)


def downgrade() -> None:
    op.execute(f"""
        UPDATE sales_commissions c SET is_paid = true, payment_method = 'OUTSIDE', paid_at = now() AT TIME ZONE 'utc'
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.field_name = 'is_paid' AND a.record_id = c.id::text
    """)
    op.execute(f"""
        UPDATE sales_commissions c SET payroll_deferred = false, admin_notes = a.old_value
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.field_name = 'admin_notes' AND a.record_id = c.id::text
    """)
    op.execute(f"DELETE FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'")
