"""sessions — Pydantic schemas (API contracts)."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class SessionStatus(str, Enum):
    recording = "recording"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class SessionMode(str, Enum):
    """Which voice stack a session runs on — mirrors `Session.provider`."""

    local = "local"
    elevenlabs = "elevenlabs"


class SessionOut(BaseModel):
    id: uuid.UUID
    status: SessionStatus
    transcript: str | None
    overview: str | None
    audio_url: str | None
    duration_seconds: int | None
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionListItemOut(BaseModel):
    id: uuid.UUID
    status: SessionStatus
    duration_seconds: int | None
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime
    has_transcript: bool
    overview: str | None


class StartSessionOut(BaseModel):
    id: uuid.UUID
    ws_token: str

    # How the client should run this session. `local` → connect to our own
    # WS /sessions/ws/{id}?token={ws_token}. `elevenlabs` → connect straight to
    # `signed_url` with the ElevenLabs browser SDK, then POST /sessions/{id}/complete.
    # `ws_token` is populated in both modes (it is just the echoed bearer), so the
    # client branches on `mode`, not on which fields are present.
    mode: SessionMode = SessionMode.local
    signed_url: str | None = None
