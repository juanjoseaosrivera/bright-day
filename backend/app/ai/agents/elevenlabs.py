"""ElevenLabs Agents Platform adapter.

Domain code must never import `httpx` and call ElevenLabs directly — use these
wrappers (architecture invariant 7: all model/provider access goes through the
`ai/` layer).

All functions are plain `def` with a synchronous `httpx.Client`, matching the
rest of the blocking-I/O stack (`storage/audio.py`, the Stripe calls). Request
handlers call them directly and FastAPI runs them in its threadpool; async
callers wrap them in `asyncio.to_thread`.
"""

from __future__ import annotations

import logging
from urllib.parse import parse_qs, urlsplit

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.ai.agents.schemas import ConversationDetail, SignedUrlResponse
from app.core.config import get_settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

_API_BASE = "https://api.elevenlabs.io/v1"

# Short timeout on the request-path call (signed-URL minting blocks POST /sessions);
# a longer one for the conversation-audio download, which runs in a background worker.
_REQUEST_TIMEOUT = 10.0
_DOWNLOAD_TIMEOUT = 60.0


def _is_retryable(exc: BaseException) -> bool:
    """Retry transport errors and 429/5xx — never a 4xx we caused.

    Retrying a bad agent id or a rejected API key just burns three attempts and
    delays a clear error, so those surface immediately.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return isinstance(exc, httpx.TransportError)


_retry_external = retry(
    retry=retry_if_exception(_is_retryable),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)


def _headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise AppError("ElevenLabs API key is not configured", status_code=500)
    return {"xi-api-key": settings.elevenlabs_api_key}


@_retry_external
def _get(path: str, *, params: dict | None = None, timeout: float) -> httpx.Response:
    with httpx.Client(timeout=timeout) as client:
        response = client.get(f"{_API_BASE}{path}", params=params, headers=_headers())
        response.raise_for_status()
        return response


def _conversation_id_from_url(signed_url: str) -> str | None:
    """Pull `conversation_id` out of a signed URL's query string.

    Verified against the live API on 2026-09-20: with `include_conversation_id=true`
    the response *body* carries only `signed_url`, and the id is a query parameter
    on that URL (`wss://…/convai/conversation?agent_id=…&conversation_id=…&
    conversation_signature=…`). Reading the body alone therefore always yielded
    None, which left `provider_conversation_id` NULL and made every session
    unreconcilable.
    """
    try:
        return parse_qs(urlsplit(signed_url).query).get("conversation_id", [None])[0]
    except ValueError:
        logger.warning("Could not parse the signed URL returned by ElevenLabs")
        return None


def create_signed_url(agent_id: str) -> tuple[str, str | None]:
    """Mint a single-use signed WebSocket URL for a private agent.

    Returns `(signed_url, conversation_id)`. `include_conversation_id=true` makes
    the signature single-use and lets the backend record the conversation id
    up-front, so the browser never has to tell us which conversation belongs to a
    session.

    The id is read from the signed URL's query string, with the response body as a
    fallback in case ElevenLabs later promotes it to a documented body field. It
    stays optional in the return type: callers must still handle `None`, because a
    session with no conversation id can never be reconciled.

    The URL must be used within 15 minutes (the conversation may then run longer),
    so mint it when the user starts a session — never on page load.
    """
    if not agent_id:
        raise AppError("ElevenLabs agent id is not configured", status_code=500)

    try:
        response = _get(
            "/convai/conversation/get-signed-url",
            params={"agent_id": agent_id, "include_conversation_id": "true"},
            timeout=_REQUEST_TIMEOUT,
        )
        parsed = SignedUrlResponse.model_validate(response.json())
    except AppError:
        raise
    except Exception as exc:
        logger.exception("Failed to mint ElevenLabs signed URL for agent %s", agent_id)
        raise AppError("Could not start a voice session right now", status_code=502) from exc

    conversation_id = _conversation_id_from_url(parsed.signed_url) or parsed.conversation_id
    if conversation_id is None:
        logger.error(
            "ElevenLabs returned no conversation_id for agent %s, in neither the "
            "signed URL nor the response body — this session cannot be reconciled "
            "and will never reach 'ready'.",
            agent_id,
        )
    return parsed.signed_url, conversation_id


def get_conversation(conversation_id: str) -> ConversationDetail:
    """Fetch conversation status, transcript, and metadata."""
    try:
        response = _get(
            f"/convai/conversations/{conversation_id}",
            timeout=_REQUEST_TIMEOUT,
        )
        return ConversationDetail.model_validate(response.json())
    except AppError:
        raise
    except Exception as exc:
        logger.exception("Failed to fetch ElevenLabs conversation %s", conversation_id)
        raise AppError("Could not fetch conversation details", status_code=502) from exc


def get_conversation_audio(conversation_id: str) -> tuple[bytes, str]:
    """Download the two-sided conversation recording.

    Returns `(audio_bytes, content_type)`. The content type is read from the
    response rather than assumed — the API reference does not document the format,
    and it determines the storage extension and the `<audio>` MIME type.

    Requires audio saving to be enabled on the agent (Privacy settings); when it is
    off there is no recording to download and this raises.
    """
    try:
        response = _get(
            f"/convai/conversations/{conversation_id}/audio",
            timeout=_DOWNLOAD_TIMEOUT,
        )
    except AppError:
        raise
    except Exception as exc:
        logger.exception("Failed to download audio for conversation %s", conversation_id)
        raise AppError("Could not download conversation audio", status_code=502) from exc

    content_type = response.headers.get("content-type", "").split(";")[0].strip()
    return response.content, content_type
