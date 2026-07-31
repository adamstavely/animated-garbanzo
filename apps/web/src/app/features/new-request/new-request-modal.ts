import { ORIGIN_OPTIONS, PRESENTATIONS, Presentation } from '@nym/shared';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideSparkles } from '@lucide/angular';

import { RequestsStore, describeError } from '../../core/state/requests.store';
import { ToastService } from '../../core/state/toast.service';
import { ButtonComponent } from '../../ui/button/button';
import { SegmentedControlComponent } from '../../ui/forms/segmented-control/segmented-control';
import { SelectFieldComponent } from '../../ui/forms/select-field/select-field';
import { TextFieldComponent } from '../../ui/forms/text-field/text-field';
import { TextareaFieldComponent } from '../../ui/forms/textarea-field/textarea-field';
import { ModalComponent } from '../../ui/modal/modal';

/**
 * Intake for a new request.
 *
 * The legal name is captured as three fields so the middle initial is
 * unambiguous — it is compared against every generated middle initial during
 * screening. Submitting creates the request and starts generation immediately;
 * the assistant never presses Generate for a new one.
 */
@Component({
  selector: 'nym-new-request-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    LucideSparkles,
    ModalComponent,
    ReactiveFormsModule,
    SegmentedControlComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TextareaFieldComponent,
  ],
  templateUrl: './new-request-modal.html',
  styleUrl: './new-request-modal.css',
})
export class NewRequestModalComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly store = inject(RequestsStore);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  readonly closed = output<void>();

  protected readonly originOptions = ORIGIN_OPTIONS;
  protected readonly presentationOptions = PRESENTATIONS.map((value) => ({ value, label: value }));

  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    middleInitial: ['', [Validators.pattern(/^[A-Za-z]?$/)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    presentation: ['Unisex' as Presentation],
    origin: [''],
    notes: ['', [Validators.maxLength(2000)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Add the author’s first and last name.');
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    try {
      const value = this.form.getRawValue();
      const created = await this.store.create(value);
      this.toasts.show(`Request created for ${created.legalName}. Generating candidates…`);
      this.closed.emit();
      await this.router.navigate(['/queue']);
    } catch (error) {
      this.error.set(describeError(error, 'That request could not be created.'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
