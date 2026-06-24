"""create auth tables

Creates the `profiles` and `onboarding_responses` tables for the auth slice.

Revision ID: 0001_create_auth_tables
Revises:
Create Date: 2026-06-22

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_create_auth_tables"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=True),
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_profiles_email", "profiles", ["email"], unique=True)

    op.create_table(
        "onboarding_responses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("primary_focus", sa.String(length=32), nullable=False),
        sa.Column(
            "focus_areas",
            postgresql.ARRAY(sa.String(length=32)),
            nullable=False,
        ),
        sa.Column("current_stress", sa.Integer(), nullable=False),
        sa.Column("checkin_frequency", sa.String(length=32), nullable=False),
        sa.Column("used_wellbeing_tools_before", sa.Boolean(), nullable=False),
        sa.Column("goals_note", sa.Text(), nullable=True),
        sa.Column("acknowledged_not_medical", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.user_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_onboarding_responses_user_id",
        "onboarding_responses",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_onboarding_responses_user_id", table_name="onboarding_responses")
    op.drop_table("onboarding_responses")
    op.drop_index("ix_profiles_email", table_name="profiles")
    op.drop_table("profiles")
