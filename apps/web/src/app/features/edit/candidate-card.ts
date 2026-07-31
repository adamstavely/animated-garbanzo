import { CandidateDto, CheckId, CheckResult } from '@nym/shared';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideLock, LucideLockOpen } from '@lucide/angular';

import { CheckLineComponent } from '../../ui/check-line/check-line';

/**
 * A candidate that has cleared screening.
 *
 * Every candidate on this pane passed the overlap and prior-use screens by
 * definition — anything that failed was discarded before review — so the two
 * statements are constants rather than per-name results.
 */
const CLEARED_CHECKS: readonly CheckResult[] = [
  { id: CheckId.Overlap, passLabel: 'No overlap', failLabel: 'Overlaps legal name', passed: true },
  { id: CheckId.PriorUse, passLabel: 'No prior use', failLabel: 'Prior use found', passed: true },
];

@Component({
  selector: 'nym-candidate-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckLineComponent, LucideLock, LucideLockOpen],
  templateUrl: './candidate-card.html',
  styleUrl: './candidate-card.css',
})
export class CandidateCardComponent {
  readonly candidate = input.required<CandidateDto>();
  readonly selected = input(false);

  readonly choose = output<CandidateDto>();
  readonly toggleLock = output<CandidateDto>();

  protected readonly clearedChecks = CLEARED_CHECKS;

  /** Locking is a nested action, so it must not also select the card. */
  protected onToggleLock(event: MouseEvent): void {
    event.stopPropagation();
    this.toggleLock.emit(this.candidate());
  }
}
