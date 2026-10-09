"""Single margin definitions: minimum markup and applied_margin_percent as real markup.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-10-09

- global_config.min_markup_percent (default 25): lines below it are flagged in red.
- applied_margin_percent of quotations and sales orders held a fraction (0.45), a percent (45) or a markup
  with the commission inside. It is recomputed from the active lines as sobreprecio % without commission:
  (Σ qty × price / (1 + commission) − Σ qty × cost) / Σ qty × cost × 100. Without cost it is only normalized
  to percent. The previous values are not kept (they had no consistent meaning).
"""
import sqlalchemy as sa
from alembic import op

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None

TABLES = [
    ("quotations", "quotation_items", "quotation_id", "is_cancelled"),
    ("sales_orders", "sales_order_items", "sales_order_id", "is_cancelled"),
]


def _rate(value) -> float:
    rate = float(value or 0.0)
    return rate / 100.0 if rate > 1.0 else rate


def _recompute(conn, header: str, items: str, fk: str, cancelled: str) -> None:
    sums = conn.execute(sa.text(
        f"SELECT {fk}, SUM(quantity * unit_price), SUM(quantity * frozen_unit_cost) FROM {items} "
        f"WHERE {cancelled} = :no GROUP BY {fk}"), {"no": False}).fetchall()
    totals = {row[0]: (float(row[1] or 0), float(row[2] or 0)) for row in sums}
    for row_id, margin, commission in conn.execute(sa.text(
            f"SELECT id, applied_margin_percent, applied_commission_percent FROM {header}")).fetchall():
        sales, cost = totals.get(row_id, (0.0, 0.0))
        if cost > 0:
            value = round((sales / (1 + _rate(commission)) - cost) / cost * 100, 2)
        elif 0 < float(margin or 0) <= 1:
            value = round(float(margin) * 100, 2)
        else:
            continue
        conn.execute(sa.text(f"UPDATE {header} SET applied_margin_percent = :v WHERE id = :id"), {"v": value, "id": row_id})


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("global_config")}
    if "min_markup_percent" not in existing:
        with op.batch_alter_table("global_config") as batch:
            batch.add_column(sa.Column("min_markup_percent", sa.Float(), nullable=False, server_default="25"))
    conn = op.get_bind()
    for header, items, fk, cancelled in TABLES:
        _recompute(conn, header, items, fk, cancelled)


def downgrade() -> None:
    # The recomputed markups stay (the old values had no consistent meaning).
    with op.batch_alter_table("global_config") as batch:
        batch.drop_column("min_markup_percent")
