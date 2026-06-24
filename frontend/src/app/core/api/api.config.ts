import { InjectionToken } from '@angular/core';

/**
 * Base URL of the backend API (e.g. `http://localhost:8000/api/v1`). Provided
 * in `app.config.ts` from the active environment and injected by the API
 * clients in `core/api/`, which are the only callers of the backend.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
