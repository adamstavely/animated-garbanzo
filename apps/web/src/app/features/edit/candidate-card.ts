import {
  CandidateDto,
  CheckId,
  CheckResult,
  overlapsLegalName,
} from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideLock, LucideLockOpen } from '@lucide/angular';

import { CheckLineComponent } from '../../ui/check-line/check-line';

/**
 * Overlap is re-evaluated against the live legal name so a brief edit that flips
 * the queue Checks column also flips each card. Prior use stays unknown until a
 * catalogue is wired — never a false green pass.
 */
function checksForCandidate(name: string, legalName: string): readonly CheckResult[] {
  return [
    {
      id: CheckId.Overlap,
      passLabel: 'No overlap',
      failLabel: 'Overlaps legal name',
      unknownLabel: 'Overlap unchecked',
      outcome: overlapsLegalName(name, legalName) ? 'failed' : 'passed',
    },
    {
      id: CheckId.PriorUse,
      passLabel: 'No prior use',
      failLabel: 'Prior use found',
      unknownLabel: 'Prior use unverified',
      outcome: 'unknown',
    },
  ];
}

@Component({
  selector: 'nym-candidate-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckLineComponent, LucideLock, LucideLockOpen],
  templateUrl: './candidate-card.html',
  styleUrl: './candidate-card.css',
})
export class CandidateCardComponent {
  readonly candidate = input.required<CandidateDto>();
  /** Live brief legal name — drives the overlap line, not a hardcoded pass. */
  readonly legalName = input.required<string>();
  readonly selected = input(false);

  readonly choose = output<CandidateDto>();
  readonly toggleLock = output<CandidateDto>();

  protected readonly checks = computed(() =>
    checksForCandidate(this.candidate().name, this.legalName()),
  );

  /** Locking is a nested action, so it must not also select the card. */
  protected onToggleLock(event: MouseEvent): void {
    event.stopPropagation();
    this.toggleLock.emit(this.candidate());
  }
}
