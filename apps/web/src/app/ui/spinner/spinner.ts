import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Indeterminate progress ring.
 *
 * Decorative: the surrounding copy ("Generating…") carries the meaning, so the
 * ring is hidden from assistive technology and stops animating under
 * `prefers-reduced-motion`.
 */
@Component({
  selector: 'nym-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="spinner" [class]="\'spinner--\' + size()" aria-hidden="true"></span>',
  styleUrl: './spinner.css',
})
export class SpinnerComponent {
  readonly size = input<'sm' | 'md'>('sm');
}
