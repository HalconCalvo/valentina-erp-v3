"""planning_module_schedule_fields

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-14 00:00:00.000000

Añade los campos del Módulo de Planeación Estratégica (Matriz de 4 Carriles)
a la tabla sales_order_item_instances:
  - 4 fechas de programación (PM, PP, IM, IP)
  - Campos de garantía y cierre histórico
  - Nuevo valor 'WARRANTY' en el enum InstanceStatus
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6a7b8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------
    # 1. Añadir el nuevo valor al enum InstanceStatus
    #    En SQLite (desarrollo local) los enums son VARCHAR,
    #    en PostgreSQL (producción) debemos hacer ALTER TYPE.
    # -------------------------------------------------------
    conn = op.get_bind()
    if conn.dialect.name == 'postgresql':
        op.execute("ALTER TYPE instancestatus ADD VALUE IF NOT EXISTS 'WARRANTY'")

    # -------------------------------------------------------
    # 2. Añadir columnas de programación (Matriz 4 Carriles)
    # -------------------------------------------------------
    op.add_column('sales_order_item_instances',
        sa.Column('scheduled_prod_mdf', sa.DateTime(), nullable=True))
    op.add_column('sales_order_item_instances',
        sa.Column('scheduled_prod_stone', sa.DateTime(), nullable=True))
    op.add_column('sales_order_item_instances',
        sa.Column('scheduled_inst_mdf', sa.DateTime(), nullable=True))
    op.add_column('sales_order_item_instances',
        sa.Column('scheduled_inst_stone', sa.DateTime(), nullable=True))

    # -------------------------------------------------------
    # 3. Añadir columnas de garantía y cierre histórico
    # -------------------------------------------------------
    op.add_column('sales_order_item_instances',
        sa.Column('warranty_started_at', sa.DateTime(), nullable=True))
    op.add_column('sales_order_item_instances',
        sa.Column('is_warranty_reopened', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')))
    op.add_column('sales_order_item_instances',
        sa.Column('warranty_reopened_at', sa.DateTime(), nullable=True))
    op.add_column('sales_order_item_instances',
        sa.Column('original_signed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('sales_order_item_instances', 'original_signed_at')
    op.drop_column('sales_order_item_instances', 'warranty_reopened_at')
    op.drop_column('sales_order_item_instances', 'is_warranty_reopened')
    op.drop_column('sales_order_item_instances', 'warranty_started_at')
    op.drop_column('sales_order_item_instances', 'scheduled_inst_stone')
    op.drop_column('sales_order_item_instances', 'scheduled_inst_mdf')
    op.drop_column('sales_order_item_instances', 'scheduled_prod_stone')
    op.drop_column('sales_order_item_instances', 'scheduled_prod_mdf')
    # Nota: PostgreSQL no permite eliminar valores de un enum fácilmente.
    # El downgrade del enum requiere recrear el tipo.
