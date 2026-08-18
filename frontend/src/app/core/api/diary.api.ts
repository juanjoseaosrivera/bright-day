import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { DiaryEntryIn, DiaryEntryListItem, DiaryEntryOut } from '@app/models/diary.model';

import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class DiaryApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listEntries(): Observable<DiaryEntryListItem[]> {
    return this.http.get<DiaryEntryListItem[]>(`${this.baseUrl}/diary`);
  }

  getEntry(id: string): Observable<DiaryEntryOut> {
    return this.http.get<DiaryEntryOut>(`${this.baseUrl}/diary/${id}`);
  }

  createEntry(body: DiaryEntryIn): Observable<DiaryEntryOut> {
    return this.http.post<DiaryEntryOut>(`${this.baseUrl}/diary`, body);
  }

  updateEntry(id: string, body: DiaryEntryIn): Observable<DiaryEntryOut> {
    return this.http.put<DiaryEntryOut>(`${this.baseUrl}/diary/${id}`, body);
  }

  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/diary/${id}`);
  }
}
