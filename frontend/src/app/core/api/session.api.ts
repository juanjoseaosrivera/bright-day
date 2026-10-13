import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { SessionListItem, SessionOut, StartSessionOut } from '@app/models/session.model';

import { API_BASE_URL } from './api.config';

/**
 * Typed client for the backend `/sessions` endpoints. The only place that
 * talks to the sessions API (architecture invariant 8).
 *
 * Local sessions are terminated entirely server-side via the WebSocket — there
 * is deliberately no HTTP endSession call. ElevenLabs sessions have no such
 * socket, so `completeSession` tells the backend to reconcile the conversation.
 */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  startSession(): Observable<StartSessionOut> {
    return this.http.post<StartSessionOut>(`${this.baseUrl}/sessions`, {});
  }

  /**
   * Tell the backend an ElevenLabs conversation has ended so it can fetch the
   * transcript and recording. Only a latency optimisation — the backend
   * reconciles abandoned sessions on its own — so failures are non-fatal.
   */
  completeSession(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/sessions/${sessionId}/complete`, {});
  }

  listSessions(): Observable<SessionListItem[]> {
    return this.http.get<SessionListItem[]>(`${this.baseUrl}/sessions`);
  }

  getSession(sessionId: string): Observable<SessionOut> {
    return this.http.get<SessionOut>(`${this.baseUrl}/sessions/${sessionId}`);
  }
}
