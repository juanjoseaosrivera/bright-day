"""add session provider columns

Adds provider tracking to `sessions` so a row records which voice stack produced
it: the local Whisper/Ollama/Kokoro loop or an ElevenLabs agent conversation.

`provider_conversation_id` holds the ElevenLabs conversation id, which the
backend mints alongside the signed URL (the browser never supplies it). The
partial unique index guarantees one conversation can never be claimed by two
session rows.

Revision ID: 0007_session_provider_columns
Revises: 0006_create_mood_logs_table
Create Date: 2026-09-06

"""

from __future__ import annotations

from alembic import op

revision: str = "0007_session_provider_columns"
down_revision: str = "0006_create_mood_logs_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows were all produced by the local stack; the server default keeps
    # inserts that predate the application-level default working too.
    op.execute("""
        ALTER TABLE sessions
            ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'local',
            ADD COLUMN provider_conversation_id VARCHAR(64)
    """)
    op.execute("""
        CREATE UNIQUE INDEX ix_sessions_provider_conversation_id
            ON sessions (provider_conversation_id)
            WHERE provider_conversation_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_sessions_provider_conversation_id")
    op.execute("""
        ALTER TABLE sessions
            DROP COLUMN IF EXISTS provider_conversation_id,
            DROP COLUMN IF EXISTS provider
    """)
