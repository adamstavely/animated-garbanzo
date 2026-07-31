import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';

import { credentialsInterceptor } from './credentials.interceptor';

describe('credentialsInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockClear();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([credentialsInterceptor])),
        provideHttpClientTesting(),
        {
          provide: DOCUMENT,
          useValue: { defaultView: { location: { assign } } },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  it('sends the session cookie with API calls', () => {
    http.get('/api/v1/requests').subscribe({ error: () => undefined });

    expect(controller.expectOne('/api/v1/requests').request.withCredentials).toBe(true);
  });

  it('leaves non-API requests untouched', () => {
    http.get('/assets/config.json').subscribe({ error: () => undefined });

    expect(controller.expectOne('/assets/config.json').request.withCredentials).toBe(false);
  });

  it('sends the browser to sign in when the session has gone', () => {
    http.get('/api/v1/requests').subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/requests').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(assign).toHaveBeenCalledWith('/api/v1/auth/login');
  });

  it('does not redirect on other failures', () => {
    http.get('/api/v1/requests').subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/requests').flush({}, { status: 500, statusText: 'Error' });

    expect(assign).not.toHaveBeenCalled();
  });

  it('never redirects on the login endpoint itself, which would loop', () => {
    http.get('/api/v1/auth/login').subscribe({ error: () => undefined });

    controller
      .expectOne('/api/v1/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(assign).not.toHaveBeenCalled();
  });
});
