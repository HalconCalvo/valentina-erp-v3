"""add phone to users

Revision ID: o1i2j3k4l5m6
Revises: n0h1i2j3k4l5
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

revision = 'o1i2j3k4l5m6'
down_revision = 'n0h1i2j3k4l5'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users', sa.Column('phone', sa.String(), nullable=True))

def downgrade():
    op.drop_column('users', 'phone')
