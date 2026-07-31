import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { ThemeService } from './theme.service';

/** Replaces `matchMedia`, which jsdom does not implement. */
function stubPrefersDark(prefersDark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: prefersDark,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function createService(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ThemeService] });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    stubPrefersDark(false);
  });

  it('follows the operating system on a first visit', () => {
    stubPrefersDark(true);

    expect(createService().theme()).toBe('dark');
  });

  it('prefers a remembered choice over the system setting', () => {
    stubPrefersDark(true);
    localStorage.setItem('nym.theme', 'light');

    expect(createService().theme()).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('nym.theme', 'sepia');

    expect(createService().theme()).toBe('light');
  });

  it('stamps the theme on the document so the token overrides apply', () => {
    const service = createService();
    TestBed.tick();

    expect(document.documentElement.dataset['theme']).toBe('light');

    service.toggle();
    TestBed.tick();

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('remembers the choice once the toggle is used', () => {
    const service = createService();

    service.toggle();

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem('nym.theme')).toBe('dark');
  });

  it('labels the toggle with the action, not the current state', () => {
    const service = createService();

    expect(service.toggleLabel()).toBe('Switch to dark theme');
    service.toggle();
    expect(service.toggleLabel()).toBe('Switch to light theme');
  });
});
