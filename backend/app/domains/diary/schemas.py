"""diary — Pydantic schemas (API contracts)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, computed_field, field_validator


class DiaryEntryIn(BaseModel):
    title: str | None = None
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content must not be blank")
        return v


class DiaryEntryListItem(BaseModel):
    id: uuid.UUID
    title: str | None
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[misc]
    @property
    def content_preview(self) -> str:
        stripped = self.content.strip()
        if len(stripped) > 120:
            return stripped[:120] + "…"
        return stripped


class DiaryEntryOut(BaseModel):
    id: uuid.UUID
    title: str | None
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
