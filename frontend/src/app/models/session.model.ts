export type SessionStatus = 'recording' | 'processing' | 'ready' | 'failed';

export interface SessionOut {
  id: string;
  status: SessionStatus;
  transcript: string | null;
  overview: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface SessionListItem {
  id: string;
  status: SessionStatus;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  has_transcript: boolean;
  overview: string | null;
}

/** Which voice stack a session runs on, chosen by the backend. */
export type SessionMode = 'local' | 'elevenlabs';

export interface StartSessionOut {
  id: string;
  ws_token: string;
  /**
   * `local` — connect to our own `WS /sessions/ws/{id}?token={ws_token}`.
   * `elevenlabs` — connect to `signed_url` with the ElevenLabs SDK, then
   * `POST /sessions/{id}/complete` when the conversation ends.
   */
  mode: SessionMode;
  /** Single-use ElevenLabs WebSocket URL; null in local mode. */
  signed_url: string | null;
}
