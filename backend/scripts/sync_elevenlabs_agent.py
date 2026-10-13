"""Bring the ElevenLabs agent's platform settings in line with this repo.

The browser-direct architecture puts a signed URL in the client's hands, so a few
agent settings are load-bearing rather than cosmetic (see README "ElevenLabs voice
sessions"). This script is the repo-side source of truth for those settings: run it
after creating an agent, and again whenever the dashboard has drifted.

Deliberately NOT managed here — these stay authored in the dashboard:
  * the system prompt, first message, language, voice, and LLM choice
  * `privacy.retention_days` (a product decision, not a code one)

Only the settings that the browser can otherwise subvert, plus the conversation
length cap, are enforced.

Usage (from `backend/`):
    uv run python scripts/sync_elevenlabs_agent.py            # dry run — prints a diff
    uv run python scripts/sync_elevenlabs_agent.py --apply    # write the changes

Reads ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID from the usual settings, so it needs
no arguments and never takes a credential on the command line.
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path
from typing import Any

import httpx

# Running a file inside `scripts/` puts that directory on sys.path, not the
# backend root, so `app` would not be importable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402

_API_BASE = "https://api.elevenlabs.io/v1"
_TIMEOUT = 30.0

# How long a single conversation may run. The default few-minute cap is shorter
# than a real session; the reconcile worker's 2-hour wait covers anything here.
MAX_CONVERSATION_SECONDS = 1800

# Client events the frontend depends on: `user_transcript` and `agent_response`
# drive the live transcript, `interruption` and `audio` drive playback state.
REQUIRED_CLIENT_EVENTS = ("audio", "interruption", "user_transcript", "agent_response")


def _fetch(client: httpx.Client, agent_id: str) -> dict[str, Any]:
    response = client.get(f"{_API_BASE}/convai/agents/{agent_id}")
    response.raise_for_status()
    return response.json()


def _disable_all_overrides(overrides: dict[str, Any]) -> None:
    """Recursively set every override flag to False.

    In browser-direct mode the *browser* sends `conversation_config_override`, so
    any flag left on is a lever a subscriber can pull from devtools — replacing the
    system prompt (stripping the wellbeing topic guard), switching the agent's
    language, or forcing text-only mode. Walking the tree rather than listing the
    known flags means a newly added override defaults to off instead of silently
    shipping enabled.
    """
    for key, value in overrides.items():
        if isinstance(value, dict):
            _disable_all_overrides(value)
        elif value is True:
            overrides[key] = False


def build_desired(current: dict[str, Any]) -> dict[str, Any]:
    """Return the PATCH payload: current config, read-modify-written.

    Full sub-objects are sent rather than partial fragments so nested-merge
    semantics on the API side can never drop a sibling key we did not intend to
    touch.
    """
    platform = current["platform_settings"]
    conversation_config = current["conversation_config"]

    # 1. Signed URLs. Without this the agent is public: anyone holding the agent
    #    id can converse on this account, bypassing subscription and quota checks
    #    entirely, which defeats the point of minting signed URLs server-side.
    auth = copy.deepcopy(platform["auth"])
    auth["enable_auth"] = True

    # 2. Every override off (see _disable_all_overrides).
    overrides = copy.deepcopy(platform["overrides"])
    _disable_all_overrides(overrides)

    # 3. Audio saving on, or there is no recording for the reconcile worker to
    #    archive and session detail pages get no player. `retention_days` is left
    #    exactly as configured — that one is a deliberate product decision.
    privacy = copy.deepcopy(platform["privacy"])
    privacy["record_voice"] = True

    conversation = copy.deepcopy(conversation_config["conversation"])
    conversation["max_duration_seconds"] = MAX_CONVERSATION_SECONDS
    events = list(conversation.get("client_events") or [])
    for event in REQUIRED_CLIENT_EVENTS:
        if event not in events:
            events.append(event)
    conversation["client_events"] = events

    return {
        "platform_settings": {"auth": auth, "overrides": overrides, "privacy": privacy},
        "conversation_config": {"conversation": conversation},
    }


def _flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten nested dicts to dotted paths so a diff reads as one line per change."""
    flat: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            flat.update(_flatten(child, f"{prefix}.{key}" if prefix else key))
    else:
        flat[prefix] = value
    return flat


def diff(current: dict[str, Any], desired: dict[str, Any]) -> list[tuple[str, Any, Any]]:
    """Changes the payload would make, as (path, before, after)."""
    before = _flatten(
        {
            "platform_settings": {
                k: current["platform_settings"][k] for k in ("auth", "overrides", "privacy")
            },
            "conversation_config": {"conversation": current["conversation_config"]["conversation"]},
        }
    )
    after = _flatten(desired)
    return [(path, before.get(path), new) for path, new in after.items() if before.get(path) != new]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the changes (without this flag the script only prints the diff)",
    )
    args = parser.parse_args()

    settings = get_settings()
    if not settings.elevenlabs_api_key or not settings.elevenlabs_agent_id:
        print("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must both be set.", file=sys.stderr)
        return 1

    headers = {"xi-api-key": settings.elevenlabs_api_key, "Content-Type": "application/json"}
    with httpx.Client(timeout=_TIMEOUT, headers=headers) as client:
        current = _fetch(client, settings.elevenlabs_agent_id)
        print(f"Agent: {current.get('name')!r} ({settings.elevenlabs_agent_id})")

        desired = build_desired(current)
        changes = diff(current, desired)
        if not changes:
            print("Already in sync — nothing to do.")
            return 0

        print(f"\n{len(changes)} change(s):")
        for path, old, new in changes:
            print(f"  {path}\n      {old!r} -> {new!r}")

        if not args.apply:
            print("\nDry run. Re-run with --apply to write these changes.")
            return 0

        response = client.patch(
            f"{_API_BASE}/convai/agents/{settings.elevenlabs_agent_id}", json=desired
        )
        if response.status_code != 200:
            print(f"\nPATCH failed: HTTP {response.status_code}", file=sys.stderr)
            print(response.text[:1000], file=sys.stderr)
            return 1

        # Re-read rather than trusting the response: this is the only thing that
        # proves the settings actually stuck.
        remaining = diff(_fetch(client, settings.elevenlabs_agent_id), desired)
        if remaining:
            print("\nApplied, but these did not stick:", file=sys.stderr)
            for path, old, new in remaining:
                print(f"  {path}: {old!r} (wanted {new!r})", file=sys.stderr)
            return 1

        print("\nApplied and verified.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
