import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AuthStore } from '../../../core/state/auth.store';

const MENU_POSITION: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 10 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -10 },
];

/** Avatar and account menu for the signed-in assistant. */
@Component({
  selector: 'nym-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './account-menu.html',
  styleUrls: ['../../../ui/menu/menu.css', './account-menu.css'],
})
export class AccountMenuComponent {
  private readonly auth = inject(AuthStore);

  protected readonly user = this.auth.user;
  protected readonly menuPosition = MENU_POSITION;

  /** Names the trigger for assistive technology; the avatar itself is initials. */
  protected readonly triggerLabel = computed(() => {
    const name = this.user()?.name;
    return name ? `Account menu for ${name}` : 'Account menu';
  });
}
