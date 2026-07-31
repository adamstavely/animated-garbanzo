import { CheckOutcome, CheckResult } from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideCheck, LucideCircleHelp, LucideX } from '@lucide/angular';

/**
 * One screening statement. Glyph and wording both change with the outcome, so
 * the result never depends on colour alone (1.4.1). Unknown means the desk has
 * no catalogue to verify against — not a silent green pass.
 */
@Component({
  selector: 'nym-check-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideCheck, LucideCircleHelp, LucideX],
  templateUrl: './check-line.html',
  styleUrl: './check-line.css',
})
export class CheckLineComponent {
  readonly check = input.required<CheckResult>();
  /** `inline` is the History row's side-by-side pair; `stacked` is the Checks column. */
  readonly layout = input<'stacked' | 'inline'>('stacked');

  protected readonly outcome = computed<CheckOutcome>(() => this.check().outcome);

  protected readonly label = computed(() => {
    const check = this.check();
    if (check.outcome === 'passed') {
      return check.passLabel;
    }
    if (check.outcome === 'failed') {
      return check.failLabel;
    }
    return check.unknownLabel;
  });
}
