"""Application lifespan hooks.

Heavy clients (LLM / STT / TTS models, the database engine/pool) are
initialized once on startup and disposed on shutdown here. The hooks are
intentionally empty during scaffolding — no heavy clients exist yet.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Startup: initialize heavy clients (LLM/STT/TTS, DB pool) here.
    yield
    # Shutdown: dispose of heavy clients here.
