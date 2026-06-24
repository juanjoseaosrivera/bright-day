"""Database engine, session factory, and the declarative base.

A single synchronous SQLAlchemy engine is created lazily from settings (no
connection is opened at import, so the app still boots without a reachable
database). Request handlers obtain a session through the `get_db` dependency;
because the engine is synchronous, the handlers that use it are defined with
plain `def` so FastAPI runs them in its threadpool (per code-standards).
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model (one metadata registry)."""


settings = get_settings()

# `pool_pre_ping` recycles connections dropped by the Supabase pooler; the
# engine connects lazily, so importing this module never requires a live DB.
engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Yield a request-scoped database session, closing it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
