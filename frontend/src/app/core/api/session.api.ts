import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { SessionListItem, SessionOut, StartSessionOut } from '@app/models/session.model';

import { API_BASE_URL } from './api.config';

/**
 * Typed client for the backend `/sessions` endpoints. The only place that
 * talks to the sessions API (architecture invariant 8). Session termination
 * is handled entirely server-side via the WebSocket — no HTTP endSession call.
 */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  startSession(): Observable<StartSessionOut> {
    return this.http.post<StartSessionOut>(`${this.baseUrl}/sessions`, {});
  }

  listSessions(): Observable<SessionListItem[]> {
    return this.http.get<SessionListItem[]>(`${this.baseUrl}/sessions`);
  }

  getSession(sessionId: string): Observable<SessionOut> {
    return this.http.get<SessionOut>(`${this.baseUrl}/sessions/${sessionId}`);
  }
}
