import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Visual weights available to buttons.
 * - `primary`   ink fill; the one obvious action on a surface
 * - `secondary` outlined; sits beside a primary without competing
 * - `ghost`     no chrome until hover; nav tabs and menu rows
 * - `danger`    red outline; destructive, always behind a confirmation
 * - `dangerSolid` red fill; the confirm button inside that dialog
 * - `inverse`   light fill on the ink approve bar
 * - `alt`       outlined in light, light primary in dark (Regenerate)
 */
export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid' | 'inverse' | 'alt';

export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The one button in the system.
 *
 * Applied as an attribute so the host stays a real `<button>` — keyboard
 * activation, disabled semantics and form participation all come for free rather
 * than being re-implemented on a div.
 */
@Component({
  selector: 'button[nymButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styleUrl: './button.css',
  host: {
    '[class]': 'hostClasses()',
    '[attr.type]': 'type()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Stretches the button to fill its container, e.g. the Generate button. */
  readonly block = input(false);

  protected readonly hostClasses = computed(() =>
    [
      'nym-button',
      `nym-button--${this.variant()}`,
      `nym-button--${this.size()}`,
      this.block() ? 'nym-button--block' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
