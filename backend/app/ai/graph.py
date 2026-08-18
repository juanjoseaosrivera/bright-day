"""LangGraph agent graph for a single conversation turn.

One turn: transcribe user audio → generate LLM response → synthesize TTS audio.

Entry point: `run_turn(user_audio, history, app_state, display_name)` → dict
"""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from tenacity import retry, stop_after_attempt, wait_exponential

from app.ai.prompts.therapy import THERAPY_SYSTEM_PROMPT_V1
from app.ai.stt import whisper as stt
from app.ai.tts import kokoro as tts
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TurnState(TypedDict):
    user_audio: bytes
    user_text: str
    ai_text: str
    ai_audio: bytes | None
    history: list[dict]
    app_state: Any
    display_name: str


# ---------------------------------------------------------------------------
# Node implementations
# ---------------------------------------------------------------------------


def _transcribe(state: TurnState) -> TurnState:
    model = state["app_state"].whisper_model
    text = stt.transcribe_chunk(state["user_audio"], model)
    return {**state, "user_text": text}


async def _generate_response(state: TurnState) -> TurnState:
    settings = get_settings()
    client = state["app_state"].llm_client
    display_name = state["display_name"]

    system_msg = {
        "role": "system",
        "content": THERAPY_SYSTEM_PROMPT_V1.format(display_name=display_name),
    }
    user_msg = {"role": "user", "content": state["user_text"]}
    messages = [system_msg, *state["history"], user_msg]

    ai_text = await _call_llm(client, settings.ollama_model, messages)

    updated_history = [
        *state["history"],
        user_msg,
        {"role": "assistant", "content": ai_text},
    ]
    return {**state, "ai_text": ai_text, "history": updated_history}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
async def _call_llm(client, model: str, messages: list[dict]) -> str:
    """Call Ollama (via openai-compatible client) with retry."""
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )
    chunks: list[str] = []
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            chunks.append(delta)
    return "".join(chunks)


def _synthesize_speech(state: TurnState) -> TurnState:
    pipeline = state["app_state"].tts_pipeline
    audio = tts.synthesize(state["ai_text"], pipeline)
    return {**state, "ai_audio": audio}


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------


def _build_graph() -> StateGraph:
    graph = StateGraph(TurnState)
    graph.add_node("transcribe", _transcribe)
    graph.add_node("generate_response", _generate_response)
    graph.add_node("synthesize_speech", _synthesize_speech)

    graph.set_entry_point("transcribe")
    graph.add_edge("transcribe", "generate_response")
    graph.add_edge("generate_response", "synthesize_speech")
    graph.add_edge("synthesize_speech", END)

    return graph.compile()


_compiled_graph = _build_graph()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_turn(
    user_audio: bytes,
    history: list[dict],
    app_state: Any,
    display_name: str,
) -> dict:
    """Execute one full conversation turn; return the updated state dict."""
    initial: TurnState = {
        "user_audio": user_audio,
        "user_text": "",
        "ai_text": "",
        "ai_audio": None,
        "history": history,
        "app_state": app_state,
        "display_name": display_name,
    }
    result = await _compiled_graph.ainvoke(initial)
    return result
