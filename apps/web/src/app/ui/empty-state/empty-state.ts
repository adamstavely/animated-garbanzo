import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Centred "nothing here" panel used by the tables and the candidates pane. */
@Component({
  selector: 'nym-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
})
export class EmptyStateComponent {
  readonly heading = input.required<string>();
  readonly description = input('');
  /** Secondary line, e.g. "2 matches in History". */
  readonly note = input('');
  /** `dashed` is the outlined variant used inside the candidates pane. */
  readonly variant = input<'plain' | 'dashed'>('plain');
}
