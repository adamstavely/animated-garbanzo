import { PenNameRequestDto } from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { RequestsStore, describeError } from '../../core/state/requests.store';
import { ToastService } from '../../core/state/toast.service';
import { pluralise } from '../../core/util/format';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state';
import { SpinnerComponent } from '../../ui/spinner/spinner';
import { HistoryTableComponent } from './history-table';

/** Completed requests. Reopening one clears the approval and returns it to the queue. */
@Component({
  selector: 'nym-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, HistoryTableComponent, SpinnerComponent],
  templateUrl: './history-page.html',
  styleUrls: ['../../ui/page/page.css', '../../ui/table/table.css'],
})
export class HistoryPageComponent {
  private readonly store = inject(RequestsStore);
  private readonly toasts = inject(ToastService);

  protected readonly requests = this.store.historyRequests;
  protected readonly error = this.store.error;
  protected readonly loading = this.store.loading;
  protected readonly listTruncated = this.store.listTruncated;
  protected readonly listTotal = this.store.listTotal;
  protected readonly shownCount = computed(() => this.store.requests().length);

  protected readonly crossTabNote = computed(() => {
    if (!this.store.query().trim()) {
      return '';
    }
    const count = this.store.queueMatchCount();
    return count ? `${count} ${pluralise(count, 'match', 'matches')} in the queue` : '';
  });

  protected async reopen(request: PenNameRequestDto): Promise<void> {
    try {
      await this.store.reopen(request.id);
      this.toasts.show(`${request.legalName} reopened and returned to the queue.`);
    } catch (error) {
      this.toasts.show(describeError(error, 'That request could not be reopened.'));
    }
  }
}
