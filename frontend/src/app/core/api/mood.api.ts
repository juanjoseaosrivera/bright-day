import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { MoodIn, MoodOut } from '@app/models/mood.model';

import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class MoodApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getTodayMood(): Observable<MoodOut | null> {
    return this.http.get<MoodOut | null>(`${this.baseUrl}/mood/today`);
  }

  logMood(body: MoodIn): Observable<MoodOut> {
    return this.http.post<MoodOut>(`${this.baseUrl}/mood/today`, body);
  }
}
