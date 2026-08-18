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
