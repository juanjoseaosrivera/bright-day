import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BehavioralPatternOut } from '@app/models/insights.model';

import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class InsightsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getPatterns(): Observable<BehavioralPatternOut[]> {
    return this.http.get<BehavioralPatternOut[]>(`${this.baseUrl}/insights/patterns`);
  }
}
