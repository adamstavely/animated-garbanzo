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
  /** False while Generating or Approved — selection and locks stay inert. */
  readonly interactive = input(true);

  readonly choose = output<CandidateDto>();
  readonly toggleLock = output<CandidateDto>();

  protected readonly checks = computed(() =>
    checksForCandidate(this.candidate().name, this.legalName()),
  );

  protected readonly overlaps = computed(() =>
    overlapsLegalName(this.candidate().name, this.legalName()),
  );

  /**
   * Overlapping names cannot be selected — matches the API choose gate. A card
   * that is already selected stays clickable so the desk can clear it after a
   * legal-name edit flips overlap to failed.
   */
  protected readonly canSelect = computed(
    () => this.interactive() && (this.selected() || !this.overlaps()),
  );

  protected readonly canLock = computed(() => this.interactive());

  /** Locking is a nested action, so it must not also select the card. */
  protected onToggleLock(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canLock()) {
      return;
    }
    this.toggleLock.emit(this.candidate());
  }
}
