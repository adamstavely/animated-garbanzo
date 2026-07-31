import { PenNameRequestDto } from '@nym/shared';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideEye, LucideGitPullRequestArrow } from '@lucide/angular';

import { formatRequestMeta, formatStamp } from '../../core/util/format';
import { ButtonComponent } from '../../ui/button/button';
import { CheckLineComponent } from '../../ui/check-line/check-line';
import { StatusPillComponent } from '../../ui/status-pill/status-pill';

/**
 * Approved requests, with the approver and time recorded against each.
 *
 * History is an audit surface, so the approver line comes from the snapshot
 * stored at approval rather than a live user lookup.
 */
@Component({
  selector: 'nym-history-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    CheckLineComponent,
    LucideEye,
    LucideGitPullRequestArrow,
    RouterLink,
    StatusPillComponent,
  ],
  templateUrl: './history-table.html',
  styleUrls: ['../../ui/table/table.css', './history-table.css'],
})
export class HistoryTableComponent {
  readonly requests = input.required<readonly PenNameRequestDto[]>();

  readonly reopen = output<PenNameRequestDto>();

  protected readonly meta = formatRequestMeta;
  protected readonly stamp = formatStamp;

  /** History shows only the overlap and prior-use checks, as the client asked. */
  protected visibleChecks(request: PenNameRequestDto): PenNameRequestDto['checks'] {
    return request.checks.slice(0, 2);
  }
}
