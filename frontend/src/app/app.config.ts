import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideNgIconsConfig } from '@ng-icons/core';

import { environment } from '../environments/environment';
import { API_BASE_URL } from './core/api/api.config';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    // Design-system icon defaults: stroke-based Lucide at a 1rem
    // (h-4 w-4) inline baseline; primitives override per-use (e.g.
    // h-5 in buttons/nav) via the NgIcon `size` input.
    provideNgIconsConfig({ size: '1rem' }),
  ],
};
