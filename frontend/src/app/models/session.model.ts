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

export interface StartSessionOut {
  id: string;
  ws_token: string;
}
