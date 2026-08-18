"""insights — HTTP router.

Routes: GET /patterns
All routes require authentication.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.insights import schemas
from app.domains.insights import service as insights_service
from sqlalchemy.orm import Session as DBSession

router = APIRouter()


@router.get("/patterns", response_model=list[schemas.BehavioralPatternOut])
def get_patterns(
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> list[schemas.BehavioralPatternOut]:
    patterns = insights_service.get_patterns(current_user.user_id, db)
    return [schemas.BehavioralPatternOut.model_validate(p) for p in patterns]
