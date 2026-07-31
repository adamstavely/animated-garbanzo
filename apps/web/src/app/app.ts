import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucidePlus } from '@lucide/angular';

import { AuthStore } from './core/state/auth.store';
import { RequestsStore } from './core/state/requests.store';
import { AccountMenuComponent } from './features/shell/account-menu/account-menu';
import { AppPickerComponent } from './features/shell/app-picker/app-picker';
import { SearchBoxComponent } from './features/shell/search-box/search-box';
import { ThemeToggleComponent } from './features/shell/theme-toggle/theme-toggle';
import { NewRequestModalComponent } from './features/new-request/new-request-modal';
import { ButtonComponent } from './ui/button/button';
import { LogoComponent } from './ui/logo/logo';
import { ToastComponent } from './ui/toast/toast';

/**
 * Application shell: the header that persists across every view, the routed
 * content, the confirmation toast, and the intake modal the header opens.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountMenuComponent,
    AppPickerComponent,
    ButtonComponent,
    LogoComponent,
    LucidePlus,
    NewRequestModalComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SearchBoxComponent,
    ThemeToggleComponent,
    ToastComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly auth = inject(AuthStore);
  private readonly requests = inject(RequestsStore);

  protected readonly newRequestOpen = signal(false);

  constructor() {
    void this.auth.load();
    void this.requests.load();
  }

  protected openNewRequest(): void {
    this.newRequestOpen.set(true);
  }

  protected closeNewRequest(): void {
    this.newRequestOpen.set(false);
  }
}
