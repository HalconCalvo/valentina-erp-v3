"""D44: global commission beneficiary and percent in GlobalConfig

Revision ID: 969c63689777
Revises: 5cd6e914c375
Create Date: 2026-10-19

The global commission stops looping over every active DIRECTOR with users.global_commission_rate (that column is
no longer read; it stays for now). It goes to the beneficiary set here (Gabriel 17/10: Lic. Gabriel Frías García),
seeded with his current rate. Commissions already generated are not touched.
"""
import sqlalchemy as sa
from alembic import op

revision = "969c63689777"
down_revision = "5cd6e914c375"
branch_labels = None
depends_on = None

BENEFICIARY_EMAIL = "g.frias.garcia@koloka.com.mx"


def upgrade() -> None:
    op.add_column("global_config", sa.Column("global_commission_user_id", sa.Integer(), sa.ForeignKey("users.id"),
                                             nullable=True))
    op.add_column("global_config", sa.Column("global_commission_percent", sa.Float(), nullable=False,
                                             server_default="0"))
    # users.global_commission_rate is stored either as a percent (2) or a fraction (0.02)
    op.execute(f"""
        UPDATE global_config SET
            global_commission_user_id = u.id,
            global_commission_percent = CASE WHEN u.global_commission_rate > 1 THEN u.global_commission_rate
                                             ELSE u.global_commission_rate * 100 END
        FROM users u
        WHERE u.email = '{BENEFICIARY_EMAIL}' AND u.is_active AND COALESCE(u.global_commission_rate, 0) > 0
    """)


def downgrade() -> None:
    op.drop_column("global_config", "global_commission_percent")
    op.drop_column("global_config", "global_commission_user_id")
