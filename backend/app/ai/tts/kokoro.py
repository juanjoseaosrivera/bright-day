"""Text-to-speech via Kokoro.

Returns raw audio bytes (PCM/WAV) or None when TTS is unavailable.
Domain code must never import kokoro_onnx directly — use this wrapper.
"""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def synthesize(text: str, pipeline) -> bytes | None:
    """Synthesize speech; return PCM/WAV bytes, or None if TTS is disabled."""
    if pipeline is None:
        logger.debug("TTS pipeline unavailable — no audio for this turn")
        return None

    try:
        import numpy as np
        import soundfile as sf

        # kokoro_onnx exposes .create(...) — the instance is not callable.
        samples, sample_rate = pipeline.create(text, voice="af_heart", speed=1.0)
        buf = io.BytesIO()
        sf.write(buf, np.array(samples), sample_rate, format="WAV")
        return buf.getvalue()
    except Exception:
        logger.exception("TTS synthesis failed")
        return None
