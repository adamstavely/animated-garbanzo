import {
  ORIGIN_OPTIONS,
  PRESENTATIONS,
  PenNameRequestDto,
  Presentation,
  RequestStatus,
  UpdateRequestPayload,
  nameInitials,
  nameWords,
} from '@nym/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { LucideFileText, LucideRotateCw, LucideSparkles, LucideTrash2 } from '@lucide/angular';

import { ButtonComponent } from '../../ui/button/button';
import { SegmentedControlComponent } from '../../ui/forms/segmented-control/segmented-control';
import { SelectFieldComponent } from '../../ui/forms/select-field/select-field';
import { TextFieldComponent } from '../../ui/forms/text-field/text-field';
import { TextareaFieldComponent } from '../../ui/forms/textarea-field/textarea-field';

/** How long to wait after typing before persisting a brief edit. */
const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * The brief pane of the edit view: the request's inputs, the exclusion list the
 * screening derives from them, and the generate / regenerate controls.
 *
 * Edits autosave — there is no Save button in the design, so the form persists
 * once typing settles.
 */
@Component({
  selector: 'nym-brief-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    LucideFileText,
    LucideRotateCw,
    LucideSparkles,
    LucideTrash2,
    ReactiveFormsModule,
    SegmentedControlComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TextareaFieldComponent,
  ],
  templateUrl: './brief-form.html',
  styleUrl: './brief-form.css',
})
export class BriefFormComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly request = input.required<PenNameRequestDto>();
  readonly promptEdited = input(false);
  /** Desk-admin actions: delete request. Prompt viewing stays open to everyone. */
  readonly canAdminister = input(false);

  readonly briefChange = output<UpdateRequestPayload>();
  readonly generate = output<void>();
  /** Emits the refine text so the page does not need a second copy of it. */
  readonly regenerate = output<string>();
  readonly openPrompt = output<void>();
  readonly askDelete = output<void>();

  protected readonly originOptions = ORIGIN_OPTIONS;
  protected readonly presentationOptions = PRESENTATIONS.map((value) => ({ value, label: value }));

  protected readonly form = this.formBuilder.nonNullable.group({
    legalName: [''],
    presentation: ['Unisex' as Presentation],
    origin: [''],
    notes: [''],
    refine: [''],
  });

  protected readonly busy = computed(() => this.request().status === RequestStatus.Generating);

  protected readonly generateLabel = computed(() => {
    if (this.busy()) {
      return 'Working…';
    }
    return this.request().candidates.length ? 'Start a fresh list' : 'Generate candidates';
  });

  protected readonly regenerateLabel = computed(() => {
    const locked = this.request().candidates.filter((candidate) => candidate.locked).length;
    return locked ? `Regenerate (${locked} locked)` : 'Regenerate';
  });

  protected readonly promptButtonLabel = computed(() =>
    this.promptEdited() ? 'Prompt · edited' : 'View prompt',
  );

  /** The words, and the initial string, that no candidate may share. */
  protected readonly exclusions = computed(() => {
    const words = nameWords(this.request().legalName);
    if (words.length === 0) {
      return ['add a name'];
    }
    return [...words, `${nameInitials(this.request().legalName).join('.')}.`];
  });

  protected readonly exclusionNote = computed(() =>
    nameWords(this.request().legalName).length
      ? 'Names sharing any of these words, initials, or phonetic stems are discarded, as are names already used by a published author.'
      : 'Enter the legal name to set the exclusion list.',
  );

  constructor() {
    // Re-seed the form whenever a different request (or a fresh server copy)
    // arrives, without echoing that back out as an edit.
    effect(() => {
      const request = this.request();
      this.form.setValue(
        {
          legalName: request.legalName,
          presentation: request.presentation,
          origin: request.origin,
          notes: request.notes,
          refine: request.refine,
        },
        { emitEvent: false },
      );
    });

    this.form.valueChanges
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.briefChange.emit(this.form.getRawValue()));
  }

  protected onRegenerate(): void {
    this.regenerate.emit(this.form.getRawValue().refine);
  }
}
