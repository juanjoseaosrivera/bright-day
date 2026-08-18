"""diary — HTTP router.

Routes: POST /, GET /, GET /{entry_id}, PUT /{entry_id}, DELETE /{entry_id}
All routes require authentication; no subscription guard (diary is quota-free).
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, Response

from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.diary import schemas
from app.domains.diary import service as diary_service
from app.workers import patterns as patterns_worker
from sqlalchemy.orm import Session as DBSession

router = APIRouter()


@router.post("/", response_model=schemas.DiaryEntryOut, status_code=201)
def create_entry(
    body: schemas.DiaryEntryIn,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> schemas.DiaryEntryOut:
    entry = diary_service.create_entry(current_user.user_id, body.title, body.content, db)
    asyncio.create_task(patterns_worker.detect_patterns_task(current_user.user_id))
    return schemas.DiaryEntryOut.model_validate(entry)


@router.get("/", response_model=list[schemas.DiaryEntryListItem])
def list_entries(
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> list[schemas.DiaryEntryListItem]:
    entries = diary_service.list_entries(current_user.user_id, db)
    return [schemas.DiaryEntryListItem.model_validate(e) for e in entries]


@router.get("/{entry_id}", response_model=schemas.DiaryEntryOut)
def get_entry(
    entry_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> schemas.DiaryEntryOut:
    entry = diary_service.get_entry(entry_id, current_user.user_id, db)
    return schemas.DiaryEntryOut.model_validate(entry)


@router.put("/{entry_id}", response_model=schemas.DiaryEntryOut)
def update_entry(
    entry_id: uuid.UUID,
    body: schemas.DiaryEntryIn,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> schemas.DiaryEntryOut:
    entry = diary_service.update_entry(entry_id, current_user.user_id, body.title, body.content, db)
    asyncio.create_task(patterns_worker.detect_patterns_task(current_user.user_id))
    return schemas.DiaryEntryOut.model_validate(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> Response:
    diary_service.delete_entry(entry_id, current_user.user_id, db)
    return Response(status_code=204)
