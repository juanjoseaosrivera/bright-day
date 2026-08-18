"""Speech-to-text via Faster-Whisper.

Domain code must never import faster_whisper directly — use these wrappers.
The model is loaded once at startup (via lifespan.py) and passed as a parameter.
"""

from __future__ import annotations

import logging
import tempfile

logger = logging.getLogger(__name__)


def transcribe_full(audio_bytes: bytes, model) -> str:
    """Transcribe a complete audio recording; return the full transcript text."""
    return _run_transcription(audio_bytes, model)


def transcribe_chunk(audio_bytes: bytes, model) -> str:
    """Transcribe a short utterance chunk; return the partial transcript text."""
    return _run_transcription(audio_bytes, model)


def _run_transcription(audio_bytes: bytes, model) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        segments, _ = model.transcribe(tmp.name, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        if not text:
            # Empty result is often a non-decodable webm fragment (e.g. an
            # utterance chunk missing the container header) — surface it.
            logger.warning(
                "Whisper produced empty transcription (%d bytes)", len(audio_bytes)
            )
        return text
