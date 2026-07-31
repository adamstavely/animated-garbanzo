import { CheckResult } from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideCheck, LucideX } from '@lucide/angular';

/**
 * One screening statement: a tick and green when it passed, a cross and red when
 * it did not. Both the glyph and the wording change with the outcome, so the
 * result never depends on colour (1.4.1).
 */
@Component({
  selector: 'nym-check-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideCheck, LucideX],
  templateUrl: './check-line.html',
  styleUrl: './check-line.css',
})
export class CheckLineComponent {
  readonly check = input.required<CheckResult>();
  /** `inline` is the History row's side-by-side pair; `stacked` is the Checks column. */
  readonly layout = input<'stacked' | 'inline'>('stacked');

  protected readonly label = computed(() =>
    this.check().passed ? this.check().passLabel : this.check().failLabel,
  );
}
