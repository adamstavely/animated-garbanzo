import { InjectionToken } from '@angular/core';

/**
 * Base path for the Nym API.
 *
 * Defaults to a same-origin path: in development `ng serve` proxies it to the
 * Nest process (see proxy.conf.json) and in production the app is served behind
 * the same host, so the session cookie is first-party in both.
 */
export const API_BASE_URL = new InjectionToken<string>('NYM_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});
