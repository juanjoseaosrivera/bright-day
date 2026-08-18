"""create insights tables

Creates the `behavioral_patterns` table for the insights domain slice.
One row per detected behavioral pattern per user (top 3, rank 1-3).

Revision ID: 0005_create_insights_tables
Revises: 0004_create_diary_entries_table
Create Date: 2026-06-28

"""

from __future__ import annotations

from alembic import op

revision: str = "0005_create_insights_tables"
down_revision: str = "0004_create_diary_entries_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE behavioral_patterns (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
            pattern_text TEXT NOT NULL,
            rank         INTEGER NOT NULL,
            detected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX ix_behavioral_patterns_user_id ON behavioral_patterns (user_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_behavioral_patterns_user_id")
    op.execute("DROP TABLE IF EXISTS behavioral_patterns")
