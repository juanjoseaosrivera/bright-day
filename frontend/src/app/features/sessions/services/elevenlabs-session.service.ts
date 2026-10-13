import { Injectable } from '@angular/core';
// Type-only import: erased at build time, so the ~590 kB SDK is not pulled into
// the session-page chunk. It is fetched by the dynamic import in `start()`,
// which means local-mode sessions never download it at all.
import type { Conversation } from '@elevenlabs/client';

/**
 * Wraps the ElevenLabs browser SDK so the session page never imports it directly.
 *
 * In ElevenLabs mode the browser connects straight to the agent, which runs STT,
 * the LLM, and TTS. The SDK owns microphone capture, PCM conversion, playback,
 * and interruption handling — this service only translates its callbacks into
 * plain values the page can push into signals.
 *
 * No conversation config is sent from here on purpose. Overrides are disabled on
 * the agent: whoever holds the signed URL could otherwise replace the system
 * prompt from devtools and strip the wellbeing topic guard. The prompt lives
 * server-side, in `app/ai/prompts/therapy.py`.
 */

export type AgentMode = 'speaking' | 'listening';
export type TranscriptSpeaker = 'You' | 'Bright Day';

export interface ElevenLabsSessionCallbacks {
  onConnected: () => void;
  onModeChange: (mode: AgentMode) => void;
  onTranscript: (speaker: TranscriptSpeaker, text: string) => void;
  /** `wasError` is false for a normal end-of-session disconnect. */
  onDisconnected: (wasError: boolean) => void;
  onError: (message: string) => void;
}

@Injectable()
export class ElevenLabsSessionService {
  private conversation: Conversation | null = null;

  /** The ElevenLabs conversation id, available once connected. */
  get conversationId(): string | null {
    return this.conversation?.getId() ?? null;
  }

  async start(signedUrl: string, callbacks: ElevenLabsSessionCallbacks): Promise<void> {
    const { Conversation: ConversationApi } = await import('@elevenlabs/client');
    this.conversation = await ConversationApi.startSession({
      signedUrl,
      connectionType: 'websocket',
      onConnect: () => callbacks.onConnected(),
      onModeChange: ({ mode }) => callbacks.onModeChange(mode),
      onMessage: ({ message, role }) =>
        callbacks.onTranscript(role === 'user' ? 'You' : 'Bright Day', message),
      onDisconnect: (details) => callbacks.onDisconnected(details.reason === 'error'),
      onError: (message) => callbacks.onError(message),
    });
  }

  /** End the conversation. Safe to call when nothing is running. */
  async stop(): Promise<void> {
    const conversation = this.conversation;
    this.conversation = null;
    if (!conversation) return;
    try {
      await conversation.endSession();
    } catch (err: unknown) {
      // Already closed, or the socket dropped first — nothing left to clean up.
      console.warn('[session] endSession failed', err);
    }
  }
}
