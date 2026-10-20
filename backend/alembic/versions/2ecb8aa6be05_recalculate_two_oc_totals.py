"""Gabriel 20/10: two OCs kept a stale total after a line quantity was edited (the edit did not recalculate it; fixed
in code e9053db). OC-M261006223132 (CERRAJES): line 807 edited 100 → 50 on 07/10, total kept the 100 (+$3,267.00).
OC-M260807225203 (MIDO): total counted 3 × $11,935.13 (August, before the change log); its 2 lines are fully
received, so it also goes from RECIBIDA_PARCIAL to RECIBIDA_TOTAL. Only these two folios and only while the total
still disagrees with the active lines (does nothing otherwise). One audit row per field; downgrade restores them.
Its supplier payables are not touched (Administración reviews them).

Revision ID: 2ecb8aa6be05
Revises: dcab654921ee
Create Date: 2026-10-20
"""
from alembic import op

revision = "2ecb8aa6be05"
down_revision = "dcab654921ee"
branch_labels = None
depends_on = None

CHANGE_ID = "oc-total-2ecb8aa6be05"
REASON = "Total recalculado con sus partidas (corrección 20/10)"
FOLIOS = ("OC-M260807225203", "OC-M261006223132")


def _audit(field: str, old_sql: str, new_sql: str, where: str = "TRUE") -> None:
    op.execute(f"""
        INSERT INTO audit_field_changes (changed_at, source, change_id, reason, table_name, record_id, operation,
                                         field_name, old_value, new_value)
        SELECT now() AT TIME ZONE 'utc', 'system', '{CHANGE_ID}', '{REASON}', 'purchase_orders', id::text,
               'UPDATE', '{field}', {old_sql}, {new_sql}
        FROM oc_rows WHERE {where}
    """)


def upgrade() -> None:
    op.execute(f"""
        CREATE TEMP TABLE oc_rows ON COMMIT DROP AS
        SELECT po.id, po.total_estimated_amount AS old_total, ROUND(s.items_total::numeric, 2)::double precision AS new_total,
               (po.status = 'RECIBIDA_PARCIAL' AND s.pending = 0) AS to_received
        FROM purchase_orders po
        JOIN (SELECT purchase_order_id,
                     SUM(quantity_ordered * expected_unit_cost) FILTER (WHERE NOT COALESCE(is_cancelled, false))
                         AS items_total,
                     COUNT(*) FILTER (WHERE NOT COALESCE(is_cancelled, false) AND NOT COALESCE(is_fulfilled, false)
                                      AND COALESCE(quantity_received, 0) < quantity_ordered) AS pending
              FROM purchase_order_items GROUP BY purchase_order_id) s ON s.purchase_order_id = po.id
        WHERE po.folio IN {FOLIOS} AND ABS(po.total_estimated_amount - s.items_total) > 0.005
    """)
    _audit("total_estimated_amount", "old_total::text", "new_total::text")
    _audit("status", "'RECIBIDA_PARCIAL'", "'RECIBIDA_TOTAL'", "to_received")
    op.execute("""
        UPDATE purchase_orders po SET total_estimated_amount = r.new_total,
               status = CASE WHEN r.to_received THEN 'RECIBIDA_TOTAL' ELSE po.status END
        FROM oc_rows r WHERE r.id = po.id
    """)


def downgrade() -> None:
    op.execute(f"""
        UPDATE purchase_orders po SET total_estimated_amount = a.old_value::double precision
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.field_name = 'total_estimated_amount' AND a.record_id = po.id::text
    """)
    op.execute(f"""
        UPDATE purchase_orders po SET status = a.old_value
        FROM audit_field_changes a
        WHERE a.change_id = '{CHANGE_ID}' AND a.field_name = 'status' AND a.record_id = po.id::text
    """)
    op.execute(f"DELETE FROM audit_field_changes WHERE change_id = '{CHANGE_ID}'")
