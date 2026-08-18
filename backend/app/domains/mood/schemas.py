"""mood — Pydantic schemas (API contracts)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class MoodIn(BaseModel):
    mood: int = Field(ge=1, le=5)


class MoodOut(BaseModel):
    id: uuid.UUID
    mood: int
    logged_date: date
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
