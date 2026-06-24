"""auth — HTTP endpoints under `/api/v1/auth`.

Handlers are plain `def` so FastAPI runs the blocking DB / Supabase calls in its
threadpool. The two protected routes resolve the caller through
`CurrentUser`, which verifies the JWT before any handler logic runs.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth import schemas, service
from app.domains.auth.dependencies import CurrentUser

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post(
    "/register",
    response_model=schemas.RegisterOut,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: schemas.RegisterIn, db: DbSession) -> schemas.RegisterOut:
    """Register a new user and trigger Supabase email verification."""
    return service.register(db, payload)


@router.post("/login", response_model=schemas.AuthTokenOut)
def login(payload: schemas.LoginIn, db: DbSession) -> schemas.AuthTokenOut:
    """Authenticate an existing (verified) user and return a JWT."""
    return service.login(db, payload)


@router.post("/onboarding", response_model=schemas.MeOut)
def submit_onboarding(
    payload: schemas.OnboardingIn, current_user: CurrentUser, db: DbSession
) -> schemas.MeOut:
    """Persist the authenticated user's onboarding answers (protected)."""
    return service.submit_onboarding(db, current_user, payload)


@router.get("/me", response_model=schemas.MeOut)
def me(current_user: CurrentUser, db: DbSession) -> schemas.MeOut:
    """Return the authenticated user's profile + onboarding (protected)."""
    return service.get_me(db, current_user)
