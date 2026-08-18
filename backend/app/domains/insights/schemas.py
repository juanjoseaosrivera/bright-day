"""insights — Pydantic schemas (API contracts)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class BehavioralPatternOut(BaseModel):
    id: uuid.UUID
    pattern_text: str
    rank: int
    detected_at: datetime

    model_config = {"from_attributes": True}
