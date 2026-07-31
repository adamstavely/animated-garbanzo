import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideMoon, LucideSun } from '@lucide/angular';

import { ThemeService } from '../../../core/state/theme.service';
import { IconButtonComponent } from '../../../ui/icon-button/icon-button';

/**
 * Light/dark switch.
 *
 * The accessible name states the action rather than the state ("Switch to dark
 * theme"), so a screen reader user knows what pressing it will do.
 */
@Component({
  selector: 'nym-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconButtonComponent, LucideMoon, LucideSun],
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.css',
})
export class ThemeToggleComponent {
  private readonly theme = inject(ThemeService);

  protected readonly isDark = this.theme.isDark;
  protected readonly label = this.theme.toggleLabel;

  protected toggle(): void {
    this.theme.toggle();
  }
}
