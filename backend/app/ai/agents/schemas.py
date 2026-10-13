"""Pydantic schemas for ElevenLabs Agents Platform API responses.

External input is validated here before any of it is trusted or persisted
(architecture invariant 5). Every model ignores unknown fields so that new
keys added by ElevenLabs never break a running deployment.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# Conversation lifecycle values documented by ElevenLabs. An unrecognized status
# is treated as "still running" rather than terminal — the reconcile worker keeps
# polling until its own wall-clock cap expires, which fails safe (no quota charge
# for a conversation we never confirmed).
CONVERSATION_STATUS_INITIATED = "initiated"
CONVERSATION_STATUS_DONE = "done"
CONVERSATION_STATUS_FAILED = "failed"
_TERMINAL_FAILURE_STATUSES = frozenset({CONVERSATION_STATUS_FAILED})


class ConversationTranscriptTurn(BaseModel):
    """One turn of the conversation transcript."""

    model_config = ConfigDict(extra="ignore")

    role: str  # "user" | "agent"
    message: str | None = None
    time_in_call_secs: int | None = None


class ConversationMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    call_duration_secs: int | None = None
    start_time_unix_secs: int | None = None


class ConversationDetail(BaseModel):
    """Response of GET /v1/convai/conversations/{conversation_id}."""

    model_config = ConfigDict(extra="ignore")

    conversation_id: str
    agent_id: str | None = None
    status: str
    transcript: list[ConversationTranscriptTurn] = []
    metadata: ConversationMetadata | None = None
    has_audio: bool = False

    @property
    def is_done(self) -> bool:
        return self.status == CONVERSATION_STATUS_DONE

    @property
    def is_failed(self) -> bool:
        return self.status in _TERMINAL_FAILURE_STATUSES

    @property
    def is_never_started(self) -> bool:
        """Still `initiated` — nobody ever connected to the signed URL."""
        return self.status == CONVERSATION_STATUS_INITIATED

    @property
    def duration_seconds(self) -> int | None:
        return self.metadata.call_duration_secs if self.metadata else None


class SignedUrlResponse(BaseModel):
    """Response of GET /v1/convai/conversation/get-signed-url.

    The live API returns only `signed_url` in the body, even with
    `include_conversation_id=true` — that flag puts the id in the signed URL's
    query string instead (see `_conversation_id_from_url` in `elevenlabs.py`).
    `conversation_id` stays declared here as a forward-compatible fallback in case
    it is later promoted to a body field.
    """

    model_config = ConfigDict(extra="ignore")

    signed_url: str
    conversation_id: str | None = None
