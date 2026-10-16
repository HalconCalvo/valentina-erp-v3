"""D21: production route CLIENTE ("Lo pone el cliente") and the catalog material PIEDRA DEL CLIENTE

Revision ID: 5cd6e914c375
Revises: b7c8d9e0f1a2
Create Date: 2026-10-16

PIEDRA DEL CLIENTE: stone category (so the house gets its stone batch, lane, manifest and INSTALAGRANITO payroll),
m², $0 fixed, never bought, no stock. Downgrade removes the material only if no recipe uses it, turns any other
CLIENTE material into SERVICIO and rebuilds the enum without CLIENTE.
"""
from alembic import op

revision = "5cd6e914c375"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None

SKU = "PIEDRA-CLIENTE"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE productionroute ADD VALUE IF NOT EXISTS 'CLIENTE'")
    op.execute(f"""
        INSERT INTO materials (sku, name, category, production_route, purchase_unit, usage_unit, conversion_factor,
                               current_cost, physical_stock, min_stock, max_stock, committed_stock, is_active,
                               is_resale, sale_price, is_fictitious)
        SELECT '{SKU}', 'PIEDRA DEL CLIENTE', 'Piedra', 'CLIENTE', 'm²', 'm²', 1.0,
               0.0, 0.0, 0.0, 0.0, 0.0, true, false, 0.0, false
        WHERE NOT EXISTS (SELECT 1 FROM materials WHERE sku = '{SKU}')
    """)


def downgrade() -> None:
    op.execute(f"""
        DELETE FROM materials WHERE sku = '{SKU}'
          AND NOT EXISTS (SELECT 1 FROM design_version_components vc WHERE vc.material_id = materials.id)
    """)
    op.execute("UPDATE materials SET production_route = 'SERVICIO' WHERE production_route = 'CLIENTE'")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE productionroute RENAME TO productionroute_old")
        op.execute("CREATE TYPE productionroute AS ENUM ('MATERIAL', 'PROCESO', 'CONSUMIBLE', 'SERVICIO')")
        op.execute("ALTER TABLE materials ALTER COLUMN production_route TYPE productionroute "
                   "USING production_route::text::productionroute")
        op.execute("DROP TYPE productionroute_old")
