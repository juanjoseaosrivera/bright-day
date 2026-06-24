import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthApi } from '@app/core/api/auth.api';
import { AuthStateService } from '@app/core/services/auth-state.service';
import {
  AuthToken,
  LoginRequest,
  Me,
  OnboardingRequest,
  RegisterRequest,
  RegisterResponse,
} from '@app/models/auth.models';

import { AuthFeatureState } from '../state/auth-feature.state';

/**
 * Orchestrates the auth feature: calls the backend through `core/api`, then
 * updates the app-wide auth state. Pages subscribe and handle navigation.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly authState = inject(AuthStateService);
  private readonly feature = inject(AuthFeatureState);

  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.api.register(body).pipe(tap(() => this.feature.setPendingEmail(body.email)));
  }

  login(body: LoginRequest): Observable<AuthToken> {
    return this.api
      .login(body)
      .pipe(tap((res) => this.authState.setSession(res.access_token, res.user)));
  }

  /** Finalize a magic-link return: store the token, then load the profile. */
  establishSession(accessToken: string): Observable<Me> {
    this.authState.setToken(accessToken);
    return this.api.me().pipe(tap((me) => this.authState.setUser(me)));
  }

  submitOnboarding(body: OnboardingRequest): Observable<Me> {
    return this.api.submitOnboarding(body).pipe(tap((me) => this.authState.setUser(me)));
  }
}
