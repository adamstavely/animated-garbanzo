import { PenNameRequestDto, RequestStatus } from '@nym/shared';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCheck, LucidePencil, LucideRotateCw } from '@lucide/angular';

import { canApproveRequest } from '../../core/util/can-approve';
import { formatRequestMeta, formatStamp } from '../../core/util/format';
import { ButtonComponent } from '../../ui/button/button';
import { CheckLineComponent } from '../../ui/check-line/check-line';
import { SpinnerComponent } from '../../ui/spinner/spinner';
import { StatusPillComponent } from '../../ui/status-pill/status-pill';

/**
 * The open-requests table.
 *
 * Presentational: it renders rows and raises intents, so the page above owns all
 * the state and this stays straightforward to test.
 */
@Component({
  selector: 'nym-queue-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    CheckLineComponent,
    LucideCheck,
    LucidePencil,
    LucideRotateCw,
    RouterLink,
    SpinnerComponent,
    StatusPillComponent,
  ],
  templateUrl: './queue-table.html',
  styleUrls: ['../../ui/table/table.css', './queue-table.css'],
})
export class QueueTableComponent {
  readonly requests = input.required<readonly PenNameRequestDto[]>();

  readonly approve = output<PenNameRequestDto>();
  readonly retry = output<PenNameRequestDto>();

  protected readonly Status = RequestStatus;
  protected readonly meta = formatRequestMeta;
  protected readonly stamp = formatStamp;

  /** Retry is offered only when the last run actually failed. */
  protected canRetry(request: PenNameRequestDto): boolean {
    return request.status === RequestStatus.Failed;
  }

  /**
   * Approve only when Ready with a proposed name that still clears live overlap.
   * Same gate as `readyCount` / bulk approve — see `canApproveRequest`.
   */
  protected canApprove(request: PenNameRequestDto): boolean {
    return canApproveRequest(request);
  }
}
