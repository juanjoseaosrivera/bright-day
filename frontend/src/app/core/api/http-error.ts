import { HttpErrorResponse } from '@angular/common/http';

/** Extract a user-facing message from a backend error response. */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof HttpErrorResponse) {
    const detail = (err.error as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string') return detail;
    if (err.status === 0) return 'Cannot reach the server. Is the backend running?';
  }
  return fallback;
}
