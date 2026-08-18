import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthStateService } from '@app/core/services/auth-state.service';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';

/**
 * Attaches the bearer token to outgoing requests and, on a 401, clears the
 * session and routes back to login. Credentials only ever travel in the
 * `Authorization` header — never in the URL path.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStateService);
  const subState = inject(SubscriptionStateService);
  const router = inject(Router);

  const token = auth.token();
  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        auth.clear();
        subState.clear();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
