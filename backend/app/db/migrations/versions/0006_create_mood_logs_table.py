"""create mood logs table

Creates the `mood_logs` table for the mood domain slice.
One row per user per calendar day; unique constraint on (user_id, logged_date).

Revision ID: 0006_create_mood_logs_table
Revises: 0005_create_insights_tables
Create Date: 2026-06-28

"""

from __future__ import annotations

from alembic import op

revision: str = "0006_create_mood_logs_table"
down_revision: str = "0005_create_insights_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE mood_logs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
            mood        INTEGER NOT NULL CHECK (mood >= 1 AND mood <= 5),
            logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (user_id, logged_date)
        )
    """)
    op.execute("CREATE INDEX ix_mood_logs_user_id ON mood_logs (user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_mood_logs_user_id")
    op.execute("DROP TABLE IF EXISTS mood_logs")
