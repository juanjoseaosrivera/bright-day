import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AuthToken,
  LoginRequest,
  Me,
  OnboardingRequest,
  RegisterRequest,
  RegisterResponse,
} from '@app/models/auth.models';

import { API_BASE_URL } from './api.config';

/**
 * Typed client for the backend `/auth` endpoints. This is the only place that
 * talks to the auth API (architecture invariant 8) — features call it through
 * `features/auth/services`.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/auth/register`, body);
  }

  login(body: LoginRequest): Observable<AuthToken> {
    return this.http.post<AuthToken>(`${this.baseUrl}/auth/login`, body);
  }

  submitOnboarding(body: OnboardingRequest): Observable<Me> {
    return this.http.post<Me>(`${this.baseUrl}/auth/onboarding`, body);
  }

  me(): Observable<Me> {
    return this.http.get<Me>(`${this.baseUrl}/auth/me`);
  }
}
