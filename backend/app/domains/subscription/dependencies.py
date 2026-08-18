"""subscription — domain-scoped FastAPI dependencies.

`require_active_subscription` enforces that the authenticated user has an active
subscription with remaining weekly quota before any protected session endpoint runs.
It is defined here and exported for use by the sessions domain router — not wired
to any route in this subscription slice.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.subscription import service


def require_active_subscription(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Raise HTTP 403 if the user has no active subscription or is at quota.

    Designed as a FastAPI dependency for the sessions domain router:

        @router.post("/sessions", dependencies=[Depends(require_active_subscription)])

    The quota check also lazily resets the weekly counter when 7+ days have
    elapsed, so no separate cron job is needed.
    """
    if not service.check_and_reset_quota(db, current_user.user_id):
        raise AppError(
            "No active subscription or session quota exhausted for this week",
            status_code=403,
        )


# Convenience alias for use as a route parameter type.
# The sessions domain imports and uses this:
#   def start_session(..., _: RequireActiveSubscription) -> ...:
RequireActiveSubscription = Annotated[None, Depends(require_active_subscription)]
