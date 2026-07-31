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
  /** Current brief — parent persists any dirty fields before starting generation. */
  readonly generate = output<UpdateRequestPayload>();
  /** Current brief (incl. refine) — parent persists, then regenerates. */
  readonly regenerate = output<UpdateRequestPayload>();
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

  /** Last brief values written into the form — used to ignore poll-only updates. */
  private seededBrief: BriefSeed | undefined;

  protected readonly busy = computed(() => this.request().status === RequestStatus.Generating);

  /** History is sealed until reopen; Generating also locks writes the API refuses. */
  protected readonly readOnly = computed(() => {
    const status = this.request().status;
    return status === RequestStatus.Approved || status === RequestStatus.Generating;
  });

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
    // Re-seed when the request id or brief fields change. Generation polling
    // replaces the whole row every few seconds (status / candidates only) —
    // those must not clobber mid-edit / pre-debounce local values — except
    // while read-only, when any drifted local values are forced back to server.
    effect(() => {
      const request = this.request();
      const brief = briefSeedFrom(request);
      const locked =
        request.status === RequestStatus.Generating ||
        request.status === RequestStatus.Approved;
      if (sameBriefSeed(this.seededBrief, brief)) {
        if (!locked || briefMatchesForm(brief, this.form.getRawValue())) {
          return;
        }
      }
      this.seededBrief = brief;
      this.form.setValue(
        {
          legalName: brief.legalName,
          presentation: brief.presentation,
          origin: brief.origin,
          notes: brief.notes,
          refine: brief.refine,
        },
        { emitEvent: false },
      );
    });

    // Lock the brief while Generating or Approved — the API refuses PATCH, and
    // leaving fields open lets local values drift from server-bound exclusions/title.
    effect(() => {
      if (this.readOnly()) {
        this.form.disable({ emitEvent: false });
      } else {
        this.form.enable({ emitEvent: false });
      }
    });

    this.form.valueChanges
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => {
        // Drop settles that fire after Generate flipped status, or on sealed History.
        if (this.readOnly()) {
          return;
        }
        this.briefChange.emit(this.form.getRawValue());
      });
  }

  /** Flush the live form with Generate so screening cannot race a pending debounce. */
  protected onGenerate(): void {
    if (this.readOnly()) {
      return;
    }
    this.generate.emit(this.form.getRawValue());
  }

  protected onRegenerate(): void {
    if (this.readOnly()) {
      return;
    }
    this.regenerate.emit(this.form.getRawValue());
  }
}

interface BriefSeed {
  id: string;
  legalName: string;
  presentation: Presentation;
  origin: string;
  notes: string;
  refine: string;
}

function briefSeedFrom(request: PenNameRequestDto): BriefSeed {
  return {
    id: request.id,
    legalName: request.legalName,
    presentation: request.presentation,
    origin: request.origin,
    notes: request.notes,
    refine: request.refine,
  };
}

function sameBriefSeed(a: BriefSeed | undefined, b: BriefSeed): boolean {
  return (
    a !== undefined &&
    a.id === b.id &&
    a.legalName === b.legalName &&
    a.presentation === b.presentation &&
    a.origin === b.origin &&
    a.notes === b.notes &&
    a.refine === b.refine
  );
}

function briefMatchesForm(
  brief: BriefSeed,
  form: { legalName: string; presentation: Presentation; origin: string; notes: string; refine: string },
): boolean {
  return (
    form.legalName === brief.legalName &&
    form.presentation === brief.presentation &&
    form.origin === brief.origin &&
    form.notes === brief.notes &&
    form.refine === brief.refine
  );
}
