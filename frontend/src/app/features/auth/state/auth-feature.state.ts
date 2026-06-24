import { Injectable, signal } from '@angular/core';

/**
 * Feature-scoped, transient auth state. Currently holds the email a user just
 * registered with, so the email-verification page can say "we sent a link to …"
 * without re-prompting.
 */
@Injectable({ providedIn: 'root' })
export class AuthFeatureState {
  private readonly _pendingEmail = signal<string | null>(null);
  readonly pendingEmail = this._pendingEmail.asReadonly();

  setPendingEmail(email: string | null): void {
    this._pendingEmail.set(email);
  }
}
