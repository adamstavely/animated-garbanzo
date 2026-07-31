import { RequestStatus } from '@nym/shared';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Status of a request, as a pill with a coloured dot.
 *
 * The word carries the meaning and the hue only reinforces it, so the status is
 * never conveyed by colour alone (1.4.1).
 */
@Component({
  selector: 'nym-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-pill.html',
  styleUrl: './status-pill.css',
})
export class StatusPillComponent {
  readonly status = input.required<RequestStatus>();

  protected readonly label = computed(() => {
    switch (this.status()) {
      case RequestStatus.Ready:
        return 'Ready';
      case RequestStatus.Approved:
        return 'Approved';
      case RequestStatus.Failed:
        return 'Failed';
      case RequestStatus.Generating:
        return 'Generating';
      default:
        return 'Queued';
    }
  });

  protected readonly tone = computed(() => {
    switch (this.status()) {
      case RequestStatus.Ready:
        return 'wait';
      case RequestStatus.Approved:
        return 'pass';
      case RequestStatus.Failed:
        return 'fail';
      default:
        return 'neutral';
    }
  });
}
