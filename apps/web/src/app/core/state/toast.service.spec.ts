import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { TOAST_DURATION_MS, ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), ToastService],
    });
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty', () => {
    expect(service.message()).toBe('');
  });

  it('shows a message and dismisses it on its own', () => {
    service.show('Bridget C. ASHWORTH approved.');
    expect(service.message()).toBe('Bridget C. ASHWORTH approved.');

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(service.message()).toBe('Bridget C. ASHWORTH approved.');

    vi.advanceTimersByTime(1);
    expect(service.message()).toBe('');
  });

  it('replaces the current message rather than queueing behind it', () => {
    service.show('First');
    vi.advanceTimersByTime(TOAST_DURATION_MS - 100);

    service.show('Second');
    expect(service.message()).toBe('Second');

    // The first toast's timer must not clear the second one early.
    vi.advanceTimersByTime(200);
    expect(service.message()).toBe('Second');

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(service.message()).toBe('');
  });

  it('can be dismissed immediately', () => {
    service.show('Anything');
    service.dismiss();

    expect(service.message()).toBe('');
  });
});
