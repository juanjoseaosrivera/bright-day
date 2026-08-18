"""Application lifespan hooks.

Heavy clients (Whisper STT, Kokoro TTS, Ollama LLM, Supabase Storage) are
initialized once on startup and attached to app.state so request handlers and
WebSocket handlers can access them without re-initialization.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Common system espeak-ng install locations (Homebrew ARM/Intel, Debian/Ubuntu).
_ESPEAK_LIB_CANDIDATES = (
    "/opt/homebrew/lib/libespeak-ng.dylib",
    "/usr/local/lib/libespeak-ng.dylib",
    "/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1",
    "/usr/lib/libespeak-ng.so.1",
)


def _resolve_espeak(settings) -> tuple[str, str] | None:
    """Locate a working system espeak-ng (library + data dir).

    Returns (lib_path, data_path) when both exist, else None. The espeakng-loader
    wheel bundled with kokoro-onnx ships a broken compiled-in data path, so a real
    espeak-ng install is required for phonemization to work.
    """
    lib = settings.espeak_library_path or next(
        (c for c in _ESPEAK_LIB_CANDIDATES if os.path.exists(c)), ""
    )
    if not lib or not os.path.exists(lib):
        return None

    data = settings.espeak_data_path
    if not data:
        # …/<prefix>/lib/libespeak-ng.* → …/<prefix>/share/espeak-ng-data
        prefix = os.path.dirname(os.path.dirname(lib))
        data = os.path.join(prefix, "share", "espeak-ng-data")
    if not os.path.exists(data):
        return None
    return lib, data


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    # --- Whisper STT (always loaded) ---
    from faster_whisper import WhisperModel

    logger.info("Loading Whisper model '%s'…", settings.whisper_model_size)
    _app.state.whisper_model = WhisperModel(
        settings.whisper_model_size, device="cpu", compute_type="int8"
    )
    logger.info("Whisper model loaded.")

    # --- Kokoro TTS (conditional — missing model files means text-only mode) ---
    model_path = settings.kokoro_model_path
    voices_path = settings.kokoro_voices_path
    if not (os.path.exists(model_path) and os.path.exists(voices_path)):
        logger.error(
            "Kokoro model files missing (model=%s exists=%s, voices=%s exists=%s) "
            "— voice output disabled (text-only). See README 'Voice / TTS setup'.",
            model_path,
            os.path.exists(model_path),
            voices_path,
            os.path.exists(voices_path),
        )
        _app.state.tts_pipeline = None
    else:
        try:
            from kokoro_onnx import Kokoro  # type: ignore[import-untyped]
            from kokoro_onnx.config import EspeakConfig  # type: ignore[import-untyped]

            espeak = _resolve_espeak(settings)
            if espeak is None:
                logger.error(
                    "No usable espeak-ng found (the bundled espeakng-loader data path "
                    "is broken) — voice output disabled. Install espeak-ng "
                    "(`brew install espeak-ng` / `apt install espeak-ng`) or set "
                    "ESPEAK_LIBRARY_PATH. See README 'Voice / TTS setup'."
                )
                _app.state.tts_pipeline = None
            else:
                lib_path, data_path = espeak
                # kokoro-onnx also reads this env var to locate the shared library.
                os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", lib_path)
                _app.state.tts_pipeline = Kokoro(
                    model_path,
                    voices_path,
                    espeak_config=EspeakConfig(lib_path=lib_path, data_path=data_path),
                )
                logger.info("Kokoro TTS initialized (espeak-ng: %s).", lib_path)
        except Exception as exc:
            logger.exception("Kokoro TTS failed to initialize (%s) — text-only mode.", exc)
            _app.state.tts_pipeline = None

    # --- LLM client (OpenAI-compatible, pointed at local Ollama) ---
    import openai

    _app.state.llm_client = openai.AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",  # Ollama ignores the key but the client requires one
    )
    logger.info("LLM client initialized.")

    # --- Supabase Storage client (reuses supabase-py) ---
    from supabase import create_client

    _app.state.supabase_storage = create_client(
        settings.supabase_url, settings.supabase_secret_key
    )
    logger.info("Supabase Storage initialized.")

    # Ensure the session-audio bucket exists so uploads never silently 404.
    # Best-effort: log and continue if it can't be verified/created.
    bucket = settings.supabase_storage_bucket
    try:
        existing = {b.name for b in _app.state.supabase_storage.storage.list_buckets()}
        if bucket not in existing:
            _app.state.supabase_storage.storage.create_bucket(
                bucket, options={"public": False}
            )
            logger.info("Created missing storage bucket %r.", bucket)
        else:
            logger.info("Storage bucket %r present.", bucket)
    except Exception as exc:
        logger.error(
            "Could not ensure storage bucket %r (%s) — session audio uploads may fail.",
            bucket,
            exc,
        )

    # --- Wire Whisper model into the transcription background worker ---
    from app.workers.transcription import set_whisper_model

    set_whisper_model(_app.state.whisper_model)

    # --- Wire LLM client into pattern detection and overview workers ---
    from app.workers.patterns import set_llm_client as set_patterns_llm
    from app.workers.overviews import set_llm_client as set_overviews_llm

    set_patterns_llm(_app.state.llm_client)
    set_overviews_llm(_app.state.llm_client)

    yield

    # Shutdown — no explicit teardown required for these clients.
    logger.info("Application shutting down.")
