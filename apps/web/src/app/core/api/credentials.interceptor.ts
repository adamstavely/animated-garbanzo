import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { catchError, throwError } from 'rxjs';

import { API_BASE_URL } from './api.tokens';

/**
 * Attaches the session cookie to every API call, and turns a 401 into a
 * redirect through the OIDC authorize endpoint.
 *
 * Doing this once, centrally, means no feature has to think about auth: the
 * assistant either has a session or is sent to get one.
 */
export const credentialsInterceptor: HttpInterceptorFn = (request, next) => {
  const baseUrl = inject(API_BASE_URL);
  const document = inject(DOCUMENT);

  const isApiCall = request.url.startsWith(baseUrl);
  const authorised = isApiCall ? request.clone({ withCredentials: true }) : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      const isUnauthorised = error instanceof HttpErrorResponse && error.status === 401;

      // The login endpoint itself is the one 401 we must not react to, or an IdP
      // problem would put the browser in a redirect loop.
      if (isApiCall && isUnauthorised && !request.url.includes('/auth/login')) {
        document.defaultView?.location.assign(`${baseUrl}/auth/login`);
      }

      return throwError(() => error);
    }),
  );
};
