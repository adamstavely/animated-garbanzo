import { PromptSettingsDto } from '@nym/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideRotateCcw, LucideSave } from '@lucide/angular';

import { NymApiService } from '../../core/api/nym-api.service';
import { describeError } from '../../core/state/requests.store';
import { ButtonComponent } from '../../ui/button/button';
import { TextareaFieldComponent } from '../../ui/forms/textarea-field/textarea-field';
import { ModalComponent } from '../../ui/modal/modal';

/**
 * The prompt panel.
 *
 * Shows the live, auto-composed prompt plus the system instruction, both
 * editable. Saving text that differs from the default sends it verbatim for
 * this request from then on; saving the default text back, or resetting,
 * restores brief-driven composition.
 */
@Component({
  selector: 'nym-prompt-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    LucideRotateCcw,
    LucideSave,
    ModalComponent,
    ReactiveFormsModule,
    TextareaFieldComponent,
  ],
  templateUrl: './prompt-modal.html',
  styleUrl: './prompt-modal.css',
})
export class PromptModalComponent {
  private readonly api = inject(NymApiService);
  private readonly formBuilder = inject(FormBuilder);

  readonly requestId = input.required<string>();
  readonly settings = input.required<PromptSettingsDto>();
  /** Saving or resetting this request’s override requires a desk-admin role. */
  readonly canAdminister = input(false);

  readonly saved = output<PromptSettingsDto>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    system: [''],
    prompt: [''],
  });

  protected readonly note = computed(() => {
    if (!this.canAdminister()) {
      return 'View only — rewriting this request’s prompt requires a desk-admin role from the identity provider.';
    }
    return this.settings().isCustom
      ? 'Custom prompt in use — sent verbatim for this request, so brief fields no longer flow into it.'
      : 'Auto-composed from the brief. Edit and save to send this text verbatim for this request.';
  });

  constructor() {
    // The panel is created fresh each time it opens, so seeding once is enough.
    queueMicrotask(() => {
      this.form.setValue({ system: this.settings().system, prompt: this.settings().prompt });
      if (!this.canAdminister()) {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await firstValueFrom(
        this.api.updatePromptSettings(this.requestId(), this.form.getRawValue()),
      );
      this.saved.emit(updated);
      this.closed.emit();
    } catch (error) {
      this.error.set(describeError(error, 'That prompt could not be saved.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async reset(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const restored = await firstValueFrom(this.api.resetPromptSettings(this.requestId()));
      this.form.setValue({ system: restored.system, prompt: restored.prompt });
      this.saved.emit(restored);
    } catch (error) {
      this.error.set(describeError(error, 'The prompt could not be reset.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
