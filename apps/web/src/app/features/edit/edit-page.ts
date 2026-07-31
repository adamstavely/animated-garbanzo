import {
  CandidateDto,
  overlapsLegalName,
  PenNameRequestDto,
  PromptSettingsDto,
  RequestStatus,
  UpdateRequestPayload,
} from '@nym/shared';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LucideArrowLeft } from '@lucide/angular';

import { NymApiService } from '../../core/api/nym-api.service';
import { AuthStore } from '../../core/state/auth.store';
import { RequestsStore, describeError } from '../../core/state/requests.store';
import { ToastService } from '../../core/state/toast.service';
import { formatScreening } from '../../core/util/format';
import { ButtonComponent } from '../../ui/button/button';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state';
import { SpinnerComponent } from '../../ui/spinner/spinner';
import { BriefFormComponent } from './brief-form';
import { CandidateCardComponent } from './candidate-card';
import { DeleteConfirmModalComponent } from './delete-confirm-modal';
import { PromptModalComponent } from './prompt-modal';

/**
 * The refine view: the rail of every request, the brief, and the screened
 * candidates for the request currently open.
 */
@Component({
  selector: 'nym-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BriefFormComponent,
    ButtonComponent,
    CandidateCardComponent,
    DeleteConfirmModalComponent,
    EmptyStateComponent,
    LucideArrowLeft,
    PromptModalComponent,
    RouterLink,
    SpinnerComponent,
  ],
  templateUrl: './edit-page.html',
  styleUrl: './edit-page.css',
})
export class EditPageComponent {
  private readonly store = inject(RequestsStore);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(NymApiService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  /** Bound from the `:id` route parameter by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  protected readonly promptSettings = signal<PromptSettingsDto | null>(null);
  protected readonly promptOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  /** True while `ensure` is resolving a deep link / filtered-out id. */
  protected readonly resolving = signal(true);

  protected readonly request = computed(() => this.store.byId(this.id()));
  protected readonly canAdminister = this.auth.canAdminister;
  protected readonly listTruncated = this.store.listTruncated;
  protected readonly listTotal = this.store.listTotal;
  protected readonly shownCount = computed(() => this.store.requests().length);

  /**
   * Rail entries: the filtered store list, with the open request prepended when
   * search or the 200-row ceiling would otherwise hide it.
   */
  protected readonly allRequests = computed(() => {
    const items = this.store.requests();
    const current = this.request();
    if (!current || items.some((entry) => entry.id === current.id)) {
      return items;
    }
    return [current, ...items];
  });

  protected readonly busy = computed(() => this.request()?.status === RequestStatus.Generating);

  /** History rows stay sealed until reopen — UI matches the API gate. */
  protected readonly sealed = computed(() => this.request()?.status === RequestStatus.Approved);

  /** Brief, candidates, and approve stay inert while Generating or Approved. */
  protected readonly readOnly = computed(() => this.busy() || this.sealed());

  /**
   * Approve is Ready-only. Hide the bar while Generating (chosenName can linger)
   * and for Approved History views.
   */
  protected readonly showApproveBar = computed(() => {
    const request = this.request();
    return (
      !!request?.chosenName &&
      request.status === RequestStatus.Ready &&
      !this.busy()
    );
  });

  /** Approve stays offered only when the selection still clears live overlap. */
  protected readonly canApproveSelection = computed(() => {
    const request = this.request();
    if (!request?.chosenName) {
      return false;
    }
    return !overlapsLegalName(request.chosenName, request.legalName);
  });

  protected readonly busyNote = signal('Drafting and screening candidates…');

  protected readonly candidates = computed(() => this.request()?.candidates ?? []);
  protected readonly hasCandidates = computed(() => this.candidates().length > 0);

  protected readonly screeningNote = computed(() =>
    formatScreening(this.request()?.discardedCount ?? 0),
  );

  protected readonly promptEdited = computed(() => this.promptSettings()?.isCustom ?? false);

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.store.pin(id);
      this.resolving.set(true);
      void this.store.ensure(id).finally(() => {
        if (this.id() === id) {
          this.resolving.set(false);
        }
      });
      onCleanup(() => this.store.unpin(id));
    });
  }

  protected async onBriefChange(payload: UpdateRequestPayload): Promise<void> {
    // Generation and History refuse brief PATCH — skip rather than toast a
    // conflict the form should already have prevented by disabling.
    if (this.readOnly()) {
      return;
    }
    try {
      await this.store.update(this.id(), payload);
    } catch (error) {
      this.toasts.show(describeError(error, 'That change could not be saved.'));
    }
  }

  protected async generate(brief: UpdateRequestPayload): Promise<void> {
    this.busyNote.set('Drafting and screening candidates…');
    await this.runAfterBrief(brief, { regenerate: false });
  }

  protected async regenerate(brief: UpdateRequestPayload): Promise<void> {
    this.busyNote.set('Regenerating around your locked names…');
    await this.runAfterBrief(brief, { regenerate: true, refine: brief.refine });
  }

  protected async choose(candidate: CandidateDto): Promise<void> {
    if (this.readOnly()) {
      return;
    }
    const current = this.request();
    const next = current?.chosenName === candidate.name ? '' : candidate.name;
    try {
      await this.store.choose(this.id(), next);
    } catch (error) {
      this.toasts.show(describeError(error, 'That selection could not be saved.'));
    }
  }

  protected async clearChoice(): Promise<void> {
    if (this.readOnly()) {
      return;
    }
    try {
      await this.store.choose(this.id(), '');
    } catch (error) {
      this.toasts.show(describeError(error, 'That selection could not be cleared.'));
    }
  }

  protected async toggleLock(candidate: CandidateDto): Promise<void> {
    if (this.readOnly()) {
      return;
    }
    try {
      await this.store.toggleLock(this.id(), candidate.id, !candidate.locked);
    } catch (error) {
      this.toasts.show(describeError(error, 'That lock could not be changed.'));
    }
  }

  protected async approve(): Promise<void> {
    const request = this.request();
    if (!request?.chosenName || !this.canApproveSelection()) {
      return;
    }
    try {
      const approved = await this.store.approve(this.id(), request.chosenName);
      this.toasts.show(`${approved.approvedName} approved for ${approved.legalName}.`);
    } catch (error) {
      this.toasts.show(describeError(error, 'That approval could not be saved.'));
    }
  }

  protected async openPrompt(): Promise<void> {
    try {
      this.promptSettings.set(await firstValueFrom(this.api.getPromptSettings(this.id())));
      this.promptOpen.set(true);
    } catch (error) {
      this.toasts.show(describeError(error, 'The prompt could not be loaded.'));
    }
  }

  protected onPromptSaved(settings: PromptSettingsDto): void {
    this.promptSettings.set(settings);
  }

  protected async confirmDelete(): Promise<void> {
    const request = this.request();
    try {
      await this.store.remove(this.id());
      this.deleteOpen.set(false);
      this.toasts.show(`${request?.legalName ?? 'Request'} deleted.`);
      await this.router.navigate(['/queue']);
    } catch (error) {
      this.toasts.show(describeError(error, 'That request could not be deleted.'));
    }
  }

  /** Rail entries summarise every request so an assistant can move between them. */
  protected railStatus(request: PenNameRequestDto): string {
    if (request.approvedName) {
      return `Approved · ${request.approvedName}`;
    }
    if (request.candidates.length) {
      return `${request.candidates.length} candidates`;
    }
    return request.status === RequestStatus.Generating ? 'Generating' : 'Draft';
  }

  /**
   * Persist any brief edits that have not yet settled through the debounce,
   * then start generation — otherwise screening runs against a stale legal name.
   */
  private async runAfterBrief(
    brief: UpdateRequestPayload,
    options: { regenerate: boolean; refine?: string },
  ): Promise<void> {
    try {
      await this.persistBriefIfChanged(brief);
    } catch (error) {
      this.toasts.show(describeError(error, 'That change could not be saved.'));
      return;
    }

    try {
      await this.store.generate(this.id(), options);
    } catch (error) {
      this.toasts.show(describeError(error, 'Generation could not be started.'));
    }
  }

  private async persistBriefIfChanged(brief: UpdateRequestPayload): Promise<void> {
    const current = this.request();
    if (!current || briefMatchesRequest(brief, current)) {
      return;
    }
    await this.store.update(this.id(), brief);
  }
}

function briefMatchesRequest(brief: UpdateRequestPayload, request: PenNameRequestDto): boolean {
  return (
    (brief.legalName ?? request.legalName) === request.legalName &&
    (brief.presentation ?? request.presentation) === request.presentation &&
    (brief.origin ?? request.origin) === request.origin &&
    (brief.notes ?? request.notes) === request.notes &&
    (brief.refine ?? request.refine) === request.refine
  );
}
