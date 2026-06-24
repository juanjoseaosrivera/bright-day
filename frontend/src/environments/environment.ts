/**
 * Base (development) environment. The production build swaps this file for
 * `environment.production.ts` via the `fileReplacements` entry in angular.json.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000/api/v1',
};
