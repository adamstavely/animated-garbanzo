import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Tiny in-process sliding-window limiter for create / generate / approve-all.
 * Fine for a single API instance; a shared store would be needed behind a fleet.
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const recent = (this.buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);

    if (recent.length >= limit) {
      throw new HttpException('Too many requests — wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    recent.push(now);
    this.buckets.set(key, recent);
  }
}
