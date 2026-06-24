"""auth — domain-scoped FastAPI dependencies.

`get_current_user` runs at the boundary of every protected endpoint: it
validates the bearer token, then resolves (and lazily provisions) the caller's
profile from the verified claims. The client never asserts its own identity —
the user is derived solely from the cryptographically verified token
(architecture invariant 2).
"""

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import InvalidTokenError, verify_supabase_jwt
from app.db.session import get_db
from app.domains.auth.models import Profile

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> Profile:
    """Resolve the authenticated user's profile from the verified JWT."""
    if credentials is None or not credentials.credentials:
        raise InvalidTokenError("Missing authentication token")

    claims = verify_supabase_jwt(credentials.credentials)

    sub = claims.get("sub")
    email = claims.get("email") or ""
    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError) as exc:
        raise InvalidTokenError() from exc

    profile = db.get(Profile, user_id)
    if profile is None:
        # First protected call after email verification — provision the profile.
        profile = Profile(user_id=user_id, email=email, onboarding_completed=False)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


CurrentUser = Annotated[Profile, Depends(get_current_user)]
