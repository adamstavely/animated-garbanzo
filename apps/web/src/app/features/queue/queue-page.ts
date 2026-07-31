import { PenNameRequestDto } from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideCheckCheck } from '@lucide/angular';

import { RequestsStore, describeError } from '../../core/state/requests.store';
import { AuthStore } from '../../core/state/auth.store';
import { ToastService } from '../../core/state/toast.service';
import { pluralise } from '../../core/util/format';
import { ButtonComponent } from '../../ui/button/button';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state';
import { SpinnerComponent } from '../../ui/spinner/spinner';
import { QueueTableComponent } from './queue-table';

/**
 * The queue: every request that has not been approved yet.
 *
 * Requests generate on intake, so an assistant's job here is to confirm the
 * checks and approve — either row by row, or all the ready ones at once.
 */
@Component({
  selector: 'nym-queue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    LucideCheckCheck,
    QueueTableComponent,
    SpinnerComponent,
  ],
  templateUrl: './queue-page.html',
  styleUrls: ['../../ui/page/page.css', '../../ui/table/table.css', './queue-page.css'],
})
export class QueuePageComponent {
  private readonly store = inject(RequestsStore);
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);

  protected readonly requests = this.store.queueRequests;
  protected readonly error = this.store.error;
  protected readonly loading = this.store.loading;
  protected readonly canAdminister = this.auth.canAdminister;
  protected readonly listTruncated = this.store.listTruncated;
  protected readonly listTotal = this.store.listTotal;
  protected readonly shownCount = computed(() => this.store.requests().length);

  protected readonly approveAllLabel = computed(() => {
    const count = this.store.readyCount();
    return count ? `Approve all ready (${count})` : 'Approve all ready';
  });

  /** When a search has no queue hits, point at the other tab rather than dead-ending. */
  protected readonly crossTabNote = computed(() => {
    if (!this.store.query().trim()) {
      return '';
    }
    const count = this.store.historyMatchCount();
    return count ? `${count} ${pluralise(count, 'match', 'matches')} in History` : '';
  });

  protected async approve(request: PenNameRequestDto): Promise<void> {
    try {
      const approved = await this.store.approve(request.id);
      this.toasts.show(`${approved.approvedName} approved for ${approved.legalName}.`);
    } catch (error) {
      this.toasts.show(describeError(error, 'That approval could not be saved.'));
    }
  }

  protected async approveAll(): Promise<void> {
    try {
      const count = await this.store.approveAll();
      this.toasts.show(
        count
          ? `${count} pen ${pluralise(count, 'name')} approved and moved to History.`
          : 'Nothing ready to approve.',
      );
    } catch (error) {
      this.toasts.show(describeError(error, 'Those approvals could not be saved.'));
    }
  }

  protected async retry(request: PenNameRequestDto): Promise<void> {
    try {
      await this.store.generate(request.id);
    } catch (error) {
      this.toasts.show(describeError(error, 'Generation could not be restarted.'));
    }
  }
}
