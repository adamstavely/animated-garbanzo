import { HttpException, HttpStatus } from '@nestjs/common';

import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows up to the limit within the window', () => {
    expect(() => limiter.consume('user-a', 2, 60_000)).not.toThrow();
    expect(() => limiter.consume('user-a', 2, 60_000)).not.toThrow();
  });

  it('rejects the next call once the limit is reached', () => {
    limiter.consume('user-a', 2, 60_000);
    limiter.consume('user-a', 2, 60_000);

    expect(() => limiter.consume('user-a', 2, 60_000)).toThrow(HttpException);

    try {
      limiter.consume('user-a', 2, 60_000);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).message).toMatch(/Too many requests/);
    }
  });

  it('tracks keys independently', () => {
    limiter.consume('user-a', 1, 60_000);
    expect(() => limiter.consume('user-b', 1, 60_000)).not.toThrow();
    expect(() => limiter.consume('user-a', 1, 60_000)).toThrow(HttpException);
  });

  it('forgets stamps that fall outside the window', () => {
    limiter.consume('user-a', 1, 1_000);
    jest.advanceTimersByTime(1_001);
    expect(() => limiter.consume('user-a', 1, 1_000)).not.toThrow();
  });
});
