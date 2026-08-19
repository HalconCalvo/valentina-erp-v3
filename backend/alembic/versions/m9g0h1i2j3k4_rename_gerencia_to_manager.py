"""rename userrole GERENCIA to MANAGER

Revision ID: m9g0h1i2j3k4
Revises: l8f9a0b1c2d3
Create Date: 2026-08-19

"""
from alembic import op

revision = 'm9g0h1i2j3k4'
down_revision = 'l8f9a0b1c2d3'
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        # Agregar MANAGER al enum (ya existe en producción, pero por si acaso)
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'MANAGER'")
    # Actualizar usuarios que tengan rol GERENCIA
    op.execute("UPDATE users SET role = 'MANAGER' WHERE role = 'GERENCIA'")

def downgrade():
    bind = op.get_bind()
    op.execute("UPDATE users SET role = 'GERENCIA' WHERE role = 'MANAGER'")
    # PostgreSQL no permite eliminar valores de enum; no revertimos MANAGER del tipo
