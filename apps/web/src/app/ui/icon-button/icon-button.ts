import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconButtonVariant = 'plain' | 'sunken';
export type IconButtonSize = 'sm' | 'md';

/**
 * A square, icon-only control.
 *
 * `label` is required and becomes the accessible name (4.1.2) — an icon-only
 * control without one is unusable with a screen reader, so the API makes it
 * impossible to omit.
 */
@Component({
  selector: 'button[nymIconButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styleUrl: './icon-button.css',
  host: {
    type: 'button',
    '[class]': 'hostClasses()',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
  },
})
export class IconButtonComponent {
  readonly label = input.required<string>();
  readonly variant = input<IconButtonVariant>('plain');
  readonly size = input<IconButtonSize>('md');

  protected readonly hostClasses = computed(() =>
    [
      'nym-icon-button',
      `nym-icon-button--${this.variant()}`,
      `nym-icon-button--${this.size()}`,
    ].join(' '),
  );
}
