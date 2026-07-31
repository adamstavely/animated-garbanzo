import { ConnectedPosition } from '@angular/cdk/overlay';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideGrid3x3 } from '@lucide/angular';

import { AuthStore } from '../../../core/state/auth.store';
import { IconButtonComponent } from '../../../ui/icon-button/icon-button';

/** Right-aligned under the trigger, matching the header's other menus. */
const MENU_POSITION: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 10 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -10 },
];

/**
 * Switcher for the wider publishing suite.
 *
 * Built on the CDK menu so it brings the full menu contract — roles, arrow-key
 * navigation, Escape to close and focus returned to the trigger.
 */
@Component({
  selector: 'nym-app-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, IconButtonComponent, LucideGrid3x3],
  templateUrl: './app-picker.html',
  styleUrls: ['../../../ui/menu/menu.css', './app-picker.css'],
})
export class AppPickerComponent {
  private readonly auth = inject(AuthStore);

  protected readonly apps = this.auth.apps;
  protected readonly menuPosition = MENU_POSITION;
}
