"""auth — Pydantic request/response contracts.

These validate all external input at the system boundary before it is trusted
or persisted (architecture invariant 5) and define the API contract the
frontend types mirror.
"""

from __future__ import annotations

import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class FocusArea(str, Enum):
    """Wellbeing focus areas (non-clinical)."""

    STRESS = "stress"
    ANXIETY = "anxiety"
    MOOD = "mood"
    SLEEP = "sleep"
    SELF_REFLECTION = "self_reflection"
    RELATIONSHIPS = "relationships"
    OTHER = "other"


class CheckinFrequency(str, Enum):
    DAILY = "daily"
    FEW_TIMES_WEEK = "few_times_week"
    WEEKLY = "weekly"


# --- Requests ---------------------------------------------------------------


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class OnboardingIn(BaseModel):
    """The concrete onboarding questionnaire — supportive, non-clinical."""

    display_name: str = Field(min_length=1, max_length=80)
    primary_focus: FocusArea
    focus_areas: list[FocusArea] = Field(min_length=1)
    current_stress: int = Field(ge=1, le=5)
    checkin_frequency: CheckinFrequency
    used_wellbeing_tools_before: bool
    goals_note: str | None = Field(default=None, max_length=2000)
    acknowledged_not_medical: bool

    @field_validator("focus_areas")
    @classmethod
    def _unique_focus_areas(cls, value: list[FocusArea]) -> list[FocusArea]:
        if len(set(value)) != len(value):
            raise ValueError("focus_areas must not contain duplicates")
        return value

    @field_validator("acknowledged_not_medical")
    @classmethod
    def _must_acknowledge(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must acknowledge this is not a medical service")
        return value


# --- Responses --------------------------------------------------------------


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: EmailStr
    display_name: str | None = None
    onboarding_completed: bool


class OnboardingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    primary_focus: str
    focus_areas: list[str]
    current_stress: int
    checkin_frequency: str
    used_wellbeing_tools_before: bool
    goals_note: str | None = None


class MeOut(UserOut):
    onboarding: OnboardingOut | None = None


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegisterOut(BaseModel):
    message: str
    email: EmailStr
