import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'nym.theme';

/**
 * Owns the light/dark choice.
 *
 * First visit follows the operating system (`prefers-color-scheme`); once the
 * assistant uses the toggle, their choice is remembered and wins from then on.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<Theme>(this.initialTheme());

  readonly theme = this.state.asReadonly();
  readonly isDark = computed(() => this.state() === 'dark');

  /** Label for the toggle's accessible name and tooltip. */
  readonly toggleLabel = computed(() =>
    this.state() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );

  constructor() {
    effect(() => {
      const theme = this.state();
      this.document.documentElement.dataset['theme'] = theme;
    });
  }

  toggle(): void {
    this.set(this.state() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.state.set(theme);
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing modes can refuse storage; the theme still applies for
      // this session, so this is not worth surfacing.
    }
  }

  private initialTheme(): Theme {
    const view = this.document.defaultView;

    try {
      const stored = view?.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Fall through to the system preference.
    }

    return view?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
