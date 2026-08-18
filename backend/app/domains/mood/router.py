"""mood — HTTP router.

Routes: POST /today (upsert), GET /today
All routes require authentication; no subscription guard.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.mood import schemas
from app.domains.mood import service as mood_service
from sqlalchemy.orm import Session as DBSession

router = APIRouter()


@router.post("/today", response_model=schemas.MoodOut, status_code=200)
def log_mood(
    body: schemas.MoodIn,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> schemas.MoodOut:
    log = mood_service.log_mood(current_user.user_id, body.mood, db)
    return schemas.MoodOut.model_validate(log)


@router.get("/today", response_model=Optional[schemas.MoodOut])
def get_today_mood(
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> Optional[schemas.MoodOut]:
    log = mood_service.get_today_mood(current_user.user_id, db)
    if log is None:
        return None
    return schemas.MoodOut.model_validate(log)
