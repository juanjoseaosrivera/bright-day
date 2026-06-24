import { computed, Injectable, signal } from '@angular/core';

import { User } from '@app/models/auth.models';

const TOKEN_KEY = 'bd_access_token';
const USER_KEY = 'bd_user';

/**
 * App-wide authentication state. Holds the current access token and user as
 * signals, hydrated from `localStorage` so a page refresh keeps the session.
 * The interceptor reads the token; guards read `isAuthenticated`.
 */
@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly _token = signal<string | null>(this.readToken());
  private readonly _user = signal<User | null>(this.readUser());

  readonly token = this._token.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);

  setSession(token: string, user: User): void {
    this.setToken(token);
    this.setUser(user);
  }

  setToken(token: string): void {
    this._token.set(token);
    localStorage.setItem(TOKEN_KEY, token);
  }

  setUser(user: User): void {
    this._user.set(user);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  clear(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private readToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private readUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
