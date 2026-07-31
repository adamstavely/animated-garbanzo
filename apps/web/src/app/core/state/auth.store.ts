import { CurrentUserDto, SuiteAppDto } from '@nym/shared';
import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api/api.tokens';
import { NymApiService } from '../api/nym-api.service';

/**
 * Holds the signed-in assistant and the publishing-suite entries.
 *
 * Sign-in itself is owned by the API: an unauthenticated load sends the browser
 * to the OIDC authorize endpoint, and the IdP returns it here with a session
 * cookie already set.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(NymApiService);
  private readonly document = inject(DOCUMENT);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly userState = signal<CurrentUserDto | null>(null);
  private readonly appsState = signal<readonly SuiteAppDto[]>([]);
  private readonly loadingState = signal(false);

  readonly user = this.userState.asReadonly();
  readonly apps = this.appsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  async load(): Promise<void> {
    this.loadingState.set(true);
    try {
      const [user, apps] = await Promise.all([
        firstValueFrom(this.api.getCurrentUser()),
        firstValueFrom(this.api.getSuiteApps()),
      ]);
      this.userState.set(user);
      this.appsState.set(apps);
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Sends the browser through the OIDC authorization code flow. */
  signIn(): void {
    const view = this.document.defaultView;
    if (view) {
      view.location.href = `${this.baseUrl}/auth/login`;
    }
  }
}
