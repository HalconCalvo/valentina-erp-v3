from alembic import op

revision = 's5m6n7o8p9q0'
down_revision = 'r4l5m6n7o8p9'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TYPE paymenttype ADD VALUE IF NOT EXISTS 'FULL'")

def downgrade():
    pass
