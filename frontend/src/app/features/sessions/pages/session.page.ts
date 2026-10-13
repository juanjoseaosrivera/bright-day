import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { API_BASE_URL } from '@app/core/api/api.config';
import { SessionApi } from '@app/core/api/session.api';
import { AuthStateService } from '@app/core/services/auth-state.service';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';
import { Badge, Button, Spinner, ToastService } from '@app/shared/ui';

import { ElevenLabsSessionService } from '../services/elevenlabs-session.service';

type SessionState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'listening'
  | 'ai_thinking'
  | 'ai_speaking'
  | 'ending'
  | 'done';

interface TranscriptEntry {
  speaker: 'You' | 'Bright Day';
  text: string;
}

@Component({
  selector: 'app-session-page',
  imports: [Badge, Button, Spinner],
  providers: [ElevenLabsSessionService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      @keyframes breathe {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.85;
        }
        50% {
          transform: scale(1.08);
          opacity: 1;
        }
      }
      @keyframes pulse-fast {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.12);
          opacity: 0.8;
        }
      }
      .anim-breathe {
        animation: breathe 3s ease-in-out infinite;
      }
      .anim-pulse {
        animation: pulse-fast 1.2s ease-in-out infinite;
      }
    `,
  ],
  template: `
    <div class="relative flex min-h-screen flex-col items-center justify-center bg-bg-base p-6">
      <!-- Sessions remaining badge -->
      <div class="absolute right-4 top-4">
        <app-badge variant="outline">
          {{ sessionsRemaining() }} session{{ sessionsRemaining() === 1 ? '' : 's' }} left
        </app-badge>
      </div>

      <!-- Central orb -->
      <div
        class="mb-10 flex h-48 w-48 items-center justify-center rounded-full transition-colors duration-500"
        [class]="orbClass()"
      >
        @if (sessionState() === 'connecting' || sessionState() === 'ending') {
          <app-spinner class="h-10 w-10 text-text-primary" />
        }
      </div>

      <!-- State label -->
      <p class="mb-8 text-sm font-medium text-text-muted">{{ stateLabel() }}</p>

      <!-- Action buttons -->
      @if (sessionState() === 'idle') {
        <button appButton class="px-8 py-3 text-base" (click)="startSession()">
          Start Session
        </button>
      }

      @if (
        sessionState() === 'listening' ||
        sessionState() === 'ai_thinking' ||
        sessionState() === 'ai_speaking'
      ) {
        <button
          appButton
          variant="outline"
          class="border-state-error px-8 py-3 text-base text-state-error"
          (click)="endSession()"
        >
          End Session
        </button>
      }

      <!-- Live transcript -->
      @if (transcript().length > 0) {
        <div class="mt-8 w-full max-w-lg rounded-lg border border-border-default bg-bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Transcript
          </h3>
          <div class="flex max-h-64 flex-col gap-3 overflow-y-auto">
            @for (entry of transcript(); track $index) {
              <div>
                <span
                  class="text-xs font-semibold"
                  [class]="entry.speaker === 'You' ? 'text-accent-primary' : 'text-text-primary'"
                  >{{ entry.speaker }}</span
                >
                <p class="mt-0.5 text-sm text-text-primary">{{ entry.text }}</p>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SessionPage implements OnDestroy {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly sessionApi = inject(SessionApi);
  private readonly authState = inject(AuthStateService);
  private readonly subState = inject(SubscriptionStateService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly elevenLabs = inject(ElevenLabsSessionService);

  protected readonly sessionState = signal<SessionState>('idle');
  protected readonly transcript = signal<TranscriptEntry[]>([]);
  protected readonly sessionsRemaining = this.subState.sessionsRemaining;

  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  private rafId: number | null = null;
  private recordedChunks: Blob[] = [];
  private utteranceHasAudio = false;
  /** Set only in ElevenLabs mode; doubles as the "which mode am I in" flag. */
  private elevenLabsSessionId: string | null = null;
  private elevenLabsFinishing = false;

  protected readonly orbClass = computed(() => {
    const base = 'h-48 w-48 rounded-full transition-colors duration-500 ';
    switch (this.sessionState()) {
      case 'listening':
        return base + 'bg-accent-primary anim-pulse';
      case 'ai_thinking':
        return base + 'bg-accent-subtle anim-breathe';
      case 'ai_speaking':
        return base + 'bg-state-error anim-breathe';
      case 'ending':
        return base + 'bg-border-default';
      default:
        return base + 'bg-accent-subtle anim-breathe';
    }
  });

  protected readonly stateLabel = computed(() => {
    switch (this.sessionState()) {
      case 'idle':
        return 'Ready to begin';
      case 'requesting_mic':
        return 'Requesting microphone access…';
      case 'connecting':
        return 'Connecting…';
      case 'listening':
        return 'Listening — speak freely';
      case 'ai_thinking':
        return 'Bright Day is thinking…';
      case 'ai_speaking':
        return 'Bright Day is speaking…';
      case 'ending':
        return 'Ending session…';
      case 'done':
        return 'Session complete';
    }
  });

  protected startSession(): void {
    this.sessionState.set('requesting_mic');

    // Mic permission is requested before POST /sessions in both modes. In
    // ElevenLabs mode that also keeps the permission prompt ahead of minting the
    // signed URL, which is only valid for 15 minutes.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.mediaStream = stream;
        this.sessionState.set('connecting');
        this.sessionApi.startSession().subscribe({
          next: (session) => {
            if (session.mode === 'elevenlabs') {
              this.startElevenLabsSession(session.id, session.signed_url, stream);
            } else {
              this.openWebSocket(session.id, session.ws_token, stream);
            }
          },
          error: (err: unknown) => {
            console.error('[session] POST /sessions failed', err);
            this.sessionState.set('idle');
            this.toast.error('Could not start session', { description: apiErrorMessage(err) });
            stream.getTracks().forEach((t) => t.stop());
          },
        });
      })
      .catch((err: unknown) => {
        console.error('[session] mic access failed', err);
        this.sessionState.set('idle');
        this.toast.error('Microphone access denied');
      });
  }

  // --- ElevenLabs mode -----------------------------------------------------

  private startElevenLabsSession(
    sessionId: string,
    signedUrl: string | null,
    stream: MediaStream,
  ): void {
    if (!signedUrl) {
      console.error('[session] elevenlabs mode without a signed_url');
      this.sessionState.set('idle');
      this.toast.error('Could not start session');
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // The SDK opens its own microphone stream, so release ours — we only held it
    // to get the permission prompt out of the way. Two live captures of the same
    // device is wasted work and can degrade echo cancellation.
    stream.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.elevenLabsSessionId = sessionId;

    void this.elevenLabs
      .start(signedUrl, {
        onConnected: () => this.sessionState.set('listening'),
        onModeChange: (mode) =>
          this.sessionState.set(mode === 'speaking' ? 'ai_speaking' : 'listening'),
        onTranscript: (speaker, text) => {
          if (!text.trim()) return;
          this.transcript.update((t) => [...t, { speaker, text }]);
        },
        onDisconnected: (wasError) => {
          if (wasError) {
            this.handleWsError();
          } else if (this.sessionState() !== 'done') {
            // Agent hung up on its own (e.g. max duration reached).
            void this.finishElevenLabsSession();
          }
        },
        onError: (message) => console.error('[session] elevenlabs error', message),
      })
      .catch((err: unknown) => {
        console.error('[session] elevenlabs startSession failed', err);
        this.sessionState.set('idle');
        this.toast.error('Could not connect to the voice agent');
      });
  }

  /**
   * End the conversation and tell the backend to reconcile it.
   *
   * The completion call is only a latency optimisation — the backend reconciles
   * abandoned sessions on its own — so a failure here is logged, not surfaced,
   * and never blocks the redirect.
   */
  private async finishElevenLabsSession(): Promise<void> {
    // Re-entrancy guard: `stop()` below makes the SDK fire its own onDisconnect,
    // which routes back here. Without this, ending a session would POST /complete
    // and navigate twice.
    if (this.elevenLabsFinishing) return;
    this.elevenLabsFinishing = true;
    this.sessionState.set('ending');

    const sessionId = this.elevenLabsSessionId;
    await this.elevenLabs.stop();
    this.sessionState.set('done');

    if (sessionId) {
      this.sessionApi.completeSession(sessionId).subscribe({
        error: (err: unknown) => console.error('[session] POST /complete failed', err),
      });
    }
    void this.router.navigateByUrl('/sessions');
  }

  // --- Local mode ----------------------------------------------------------

  private openWebSocket(sessionId: string, token: string, stream: MediaStream): void {
    const wsBase = this.apiBaseUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/sessions/ws/${sessionId}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => console.info('[session] ws open', wsUrl);

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleTextMessage(event.data, stream);
      } else {
        this.handleBinaryMessage(event.data as ArrayBuffer);
      }
    };

    this.ws.onerror = (event) => {
      console.error('[session] ws error', event);
      this.handleWsError();
    };
    this.ws.onclose = (e) => {
      // Close codes 4001/4003/4004 are the backend's auth/ownership/status rejects.
      console.warn('[session] ws closed', e.code, e.reason);
      if (e.code !== 1000 && e.code !== 1005 && this.sessionState() !== 'done') {
        this.handleWsError();
      }
    };
  }

  private handleTextMessage(data: string, stream: MediaStream): void {
    let msg: { type: string; text?: string; session_id?: string };
    try {
      msg = JSON.parse(data) as { type: string; text?: string; session_id?: string };
    } catch (err) {
      console.error('[session] malformed text frame', data, err);
      return;
    }

    if (msg.type === 'ready') {
      this.sessionState.set('listening');
      this.startRecording(stream);
    } else if (msg.type === 'ai_text' && msg.text) {
      this.transcript.update((t) => [...t, { speaker: 'Bright Day', text: msg.text! }]);
    } else if (msg.type === 'turn_complete') {
      if (this.sessionState() === 'ai_thinking') {
        this.utteranceHasAudio = false;
        this.sessionState.set('listening');
      }
    } else if (msg.type === 'session_ended') {
      this.sessionState.set('done');
      this.cleanupAudio();
      this.ws?.close();
      void this.router.navigateByUrl('/sessions');
    }
  }

  private handleBinaryMessage(buffer: ArrayBuffer): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    // Autoplay policy can leave the context suspended if user activation lapsed
    // across the async hops (getUserMedia → HTTP → WS handshake).
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    this.audioContext
      .decodeAudioData(buffer.slice(0))
      .then((audioBuffer) => {
        this.sessionState.set('ai_speaking');
        const source = this.audioContext!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext!.destination);
        source.onended = () => {
          if (this.sessionState() === 'ai_speaking') {
            this.sessionState.set('listening');
          }
        };
        source.start();
      })
      .catch((err: unknown) => {
        console.error('[session] TTS decode failed', err);
      });
  }

  // Preferred first; Safari supports none of the webm/ogg types and needs mp4.
  private static readonly MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];

  private startRecording(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    console.info('[session] audio track', {
      readyState: track?.readyState,
      muted: track?.muted,
      enabled: track?.enabled,
      settings: track?.getSettings?.(),
    });

    const mimeType = SessionPage.MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));

    try {
      this.mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream); // no supported type found — let the browser choose
    } catch (err) {
      console.error('[session] MediaRecorder construction failed', mimeType, err);
      this.toast.error('Could not start recording', {
        description:
          'A browser extension may be blocking it — try a window with extensions disabled.',
      });
      this.endSession();
      return;
    }
    console.info('[session] recording as', this.mediaRecorder.mimeType || '(browser default)');

    this.mediaRecorder.onerror = (e) => console.error('[session] MediaRecorder error', e);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
        if (this.ws?.readyState === WebSocket.OPEN && this.sessionState() === 'listening') {
          e.data
            .arrayBuffer()
            .then((buf) => {
              if (this.ws?.readyState === WebSocket.OPEN && this.sessionState() === 'listening') {
                this.ws.send(buf);
                this.utteranceHasAudio = true;
              }
            })
            .catch((err: unknown) => console.error('[session] chunk send failed', err));
        }
      }
    };

    try {
      this.mediaRecorder.start(250);
    } catch (err) {
      console.error('[session] MediaRecorder.start failed', this.mediaRecorder.mimeType, err);
      this.toast.error('Could not start recording', {
        description:
          'A browser extension may be blocking it — try a window with extensions disabled.',
      });
      this.endSession();
      return;
    }
    this.startSilenceDetection(stream);
  }

  private startSilenceDetection(stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.sourceNode.connect(this.analyserNode);

    const data = new Uint8Array(this.analyserNode.fftSize);
    let silenceStart: number | null = null;

    const check = () => {
      if (!this.analyserNode || this.sessionState() === 'ending') return;

      this.analyserNode.getByteTimeDomainData(data);
      // RMS of waveform: values are 0-255 centered at 128 (silence).
      // Dividing by 128 normalises to 0.0-1.0 range.
      const rms = Math.sqrt(data.reduce((sum, v) => sum + (v - 128) ** 2, 0) / data.length) / 128;
      const isSilent = rms < 0.02;

      if (isSilent && this.sessionState() === 'listening') {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart >= 1500) {
          silenceStart = null;
          this.sendEndUtterance();
        }
      } else {
        silenceStart = null;
      }

      this.rafId = requestAnimationFrame(check);
    };
    this.rafId = requestAnimationFrame(check);
  }

  private sendEndUtterance(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionState() === 'listening') {
      if (!this.utteranceHasAudio) return;
      this.utteranceHasAudio = false;
      this.ws.send(JSON.stringify({ type: 'end_utterance' }));
      this.sessionState.set('ai_thinking');
    }
  }

  protected endSession(): void {
    if (this.elevenLabsSessionId) {
      void this.finishElevenLabsSession();
      return;
    }
    this.mediaRecorder?.stop();
    this.cleanupAudio();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end_session' }));
    }
    this.sessionState.set('ending');
  }

  private handleWsError(): void {
    if (this.sessionState() !== 'done') {
      console.error('[session] connection lost (state:', this.sessionState() + ')');
      this.cleanupAudio();
      this.toast.error('Session connection lost');
      void this.router.navigateByUrl('/sessions');
    }
  }

  /**
   * Tear down WebAudio (silence-detection loop, nodes, context) before the mic
   * tracks are stopped. Idempotent — safe to call from every teardown path.
   * Skipping this order produces "AudioContext encountered an error from the
   * audio device" when tracks are stopped while the context is still running.
   */
  private cleanupAudio(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    try {
      this.analyserNode?.disconnect();
      this.sourceNode?.disconnect();
    } catch {
      // nodes may already be disconnected
    }
    this.analyserNode = null;
    this.sourceNode = null;
    const ctx = this.audioContext;
    this.audioContext = null;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {
        // already closing/closed
      });
    }
  }

  ngOnDestroy(): void {
    this.cleanupAudio();
    this.mediaRecorder?.stop();
    this.ws?.close();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    void this.elevenLabs.stop();
  }
}
