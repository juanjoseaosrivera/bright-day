"""auth — domain service.

The only cross-domain entry point for authentication. Wraps Supabase Auth
(register / login) and persists the profile + onboarding data. Email
verification itself is performed by Supabase: registration triggers a
confirmation email whose link returns the user to the frontend with a verified
session; the backend then validates that session's JWT on every protected
request (see `dependencies.get_current_user`).
"""

import uuid
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session
from supabase import Client, create_client

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.domains.auth import schemas
from app.domains.auth.models import OnboardingResponse, Profile


@lru_cache
def get_supabase_client() -> Client:
    """Cached server-side Supabase client (initialized with the secret key)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def _translate_auth_error(exc: Exception) -> AppError:
    """Map a Supabase Auth error into an `AppError` with a sane status code."""
    status = getattr(exc, "status", None)
    message = getattr(exc, "message", None) or str(exc) or "Authentication failed"
    status_code = status if isinstance(status, int) and 400 <= status < 600 else 400
    return AppError(message, status_code=status_code)


def register(db: Session, payload: schemas.RegisterIn) -> schemas.RegisterOut:
    """Register a user with Supabase and create their (pending) profile."""
    settings = get_settings()
    client = get_supabase_client()
    try:
        result = client.auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {
                    "email_redirect_to": f"{settings.frontend_url}/auth/verify-email"
                },
            }
        )
    except Exception as exc:  # noqa: BLE001 — normalize SDK errors to AppError
        raise _translate_auth_error(exc) from exc

    if result.user is None:
        raise AppError("Registration failed", status_code=400)

    _ensure_profile(db, user_id=uuid.UUID(result.user.id), email=payload.email)

    return schemas.RegisterOut(
        message="Verification email sent. Check your inbox to confirm your account.",
        email=payload.email,
    )


def login(db: Session, payload: schemas.LoginIn) -> schemas.AuthTokenOut:
    """Authenticate against Supabase and return the access token + profile."""
    client = get_supabase_client()
    try:
        result = client.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except Exception as exc:  # noqa: BLE001
        raise _translate_auth_error(exc) from exc

    if result.session is None or result.user is None:
        raise AppError("Invalid credentials", status_code=401)

    profile = _ensure_profile(
        db, user_id=uuid.UUID(result.user.id), email=result.user.email or payload.email
    )
    return schemas.AuthTokenOut(
        access_token=result.session.access_token,
        user=schemas.UserOut.model_validate(profile),
    )


def submit_onboarding(
    db: Session, profile: Profile, payload: schemas.OnboardingIn
) -> schemas.MeOut:
    """Persist onboarding answers and mark the profile onboarded."""
    answers = db.scalar(
        select(OnboardingResponse).where(OnboardingResponse.user_id == profile.user_id)
    )
    fields = {
        "primary_focus": payload.primary_focus.value,
        "focus_areas": [area.value for area in payload.focus_areas],
        "current_stress": payload.current_stress,
        "checkin_frequency": payload.checkin_frequency.value,
        "used_wellbeing_tools_before": payload.used_wellbeing_tools_before,
        "goals_note": payload.goals_note,
        "acknowledged_not_medical": payload.acknowledged_not_medical,
    }

    if answers is None:
        answers = OnboardingResponse(user_id=profile.user_id, **fields)
        db.add(answers)
    else:
        for key, value in fields.items():
            setattr(answers, key, value)

    profile.display_name = payload.display_name
    profile.onboarding_completed = True

    db.commit()
    db.refresh(profile)
    return get_me(db, profile)


def get_me(db: Session, profile: Profile) -> schemas.MeOut:
    """Return the current user's profile and onboarding answers."""
    return schemas.MeOut.model_validate(profile)


def _ensure_profile(db: Session, *, user_id: uuid.UUID, email: str) -> Profile:
    """Idempotently fetch-or-create the profile for a Supabase user."""
    profile = db.get(Profile, user_id)
    if profile is None:
        profile = Profile(user_id=user_id, email=email, onboarding_completed=False)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile
