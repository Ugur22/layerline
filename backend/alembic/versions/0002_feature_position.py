"""feature position

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Features stored before this revision have no recorded order, so they all start at 0 and keep
    # their previous (arbitrary) order until the file is imported again.
    op.add_column(
        "spatial_features",
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("spatial_features", "position")
