import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

import { ToastService } from '../../core/state/toast.service';

/**
 * Confirmation toast.
 *
 * The live region is always in the DOM and only its text changes, which is what
 * makes assistive technology announce updates reliably. It is polite and never
 * takes focus (4.1.3).
 */
@Component({
  selector: 'nym-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideCheck],
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class ToastComponent {
  private readonly toasts = inject(ToastService);
  protected readonly message = this.toasts.message;
}
