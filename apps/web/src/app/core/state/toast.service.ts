import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** How long a confirmation stays on screen before it dismisses itself. */
export const TOAST_DURATION_MS = 3600;

/**
 * Single-slot confirmation toast.
 *
 * A new message replaces the current one rather than queueing: approvals come in
 * bursts, and a queue would leave stale confirmations on screen. The toast is
 * announced politely and never takes focus (4.1.3).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly state = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly message = this.state.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  show(message: string): void {
    this.clearTimer();
    this.state.set(message);
    this.timer = setTimeout(() => this.state.set(''), TOAST_DURATION_MS);
  }

  dismiss(): void {
    this.clearTimer();
    this.state.set('');
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
