import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { LucideX } from '@lucide/angular';

import { IconButtonComponent } from '../icon-button/icon-button';

let nextId = 0;

/** Focusable elements a dialog can hand focus to when it opens. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog.
 *
 * Rendered only while open (the caller wraps it in `@if`), which keeps the
 * lifecycle honest. On open it remembers what had focus and moves focus into the
 * dialog; on close it puts focus back, so a keyboard user never loses their
 * place. `cdkTrapFocus` keeps Tab cycling inside the panel, and both Escape and a
 * click on the scrim dismiss.
 *
 * Focus is moved explicitly rather than through the CDK's auto-capture, which
 * waits on an NgZone stable event that a zoneless application never emits.
 */
@Component({
  selector: 'nym-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, IconButtonComponent, LucideX],
  templateUrl: './modal.html',
  styleUrl: './modal.css',
  host: {
    '(document:keydown.escape)': 'dismiss()',
  },
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  /** Small uppercase line above the title, e.g. "Delete request". */
  readonly eyebrow = input('');
  readonly heading = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** `display` renders the title in the serif, as the delete dialog does. */
  readonly headingStyle = input<'ui' | 'display'>('ui');
  /** Elevates the delete dialog above the panel it was opened from. */
  readonly elevated = input(false);

  readonly dismissed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly scrim = viewChild.required<ElementRef<HTMLElement>>('scrim');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  private previouslyFocused: HTMLElement | null = null;

  protected readonly headingId = `nym-modal-title-${++nextId}`;
  protected readonly panelClasses = computed(() => `modal__panel modal__panel--${this.size()}`);

  ngAfterViewInit(): void {
    this.previouslyFocused = this.document.activeElement as HTMLElement | null;

    const panel = this.panel().nativeElement;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  protected dismiss(): void {
    this.dismissed.emit();
  }

  /** Only a click on the scrim itself dismisses; clicks inside the panel do not. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.scrim().nativeElement) {
      this.dismiss();
    }
  }
}
