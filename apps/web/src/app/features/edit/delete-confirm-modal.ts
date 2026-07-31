import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideTrash2 } from '@lucide/angular';

import { ButtonComponent } from '../../ui/button/button';
import { ModalComponent } from '../../ui/modal/modal';

/**
 * "Are you sure?" for deletion.
 *
 * Names the author and states plainly that the action cannot be undone — the
 * request and every candidate generated for it go with it.
 */
@Component({
  selector: 'nym-delete-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, LucideTrash2, ModalComponent],
  templateUrl: './delete-confirm-modal.html',
  styleUrl: './delete-confirm-modal.css',
})
export class DeleteConfirmModalComponent {
  readonly legalName = input.required<string>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly note = computed(
    () =>
      `This removes the request for ${this.legalName() || 'this author'} and its generated candidates. It cannot be undone.`,
  );
}
