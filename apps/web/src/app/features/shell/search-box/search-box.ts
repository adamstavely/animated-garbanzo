import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { LucideSearch, LucideX } from '@lucide/angular';

import { RequestsStore } from '../../../core/state/requests.store';
import { IconButtonComponent } from '../../../ui/icon-button/icon-button';

/**
 * The header search.
 *
 * One field filters both tabs; the store owns the term and reloads from the API,
 * so the queue and History stay consistent with each other and with the
 * cross-tab match counts.
 */
@Component({
  selector: 'nym-search-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconButtonComponent, LucideSearch, LucideX],
  templateUrl: './search-box.html',
  styleUrl: './search-box.css',
})
export class SearchBoxComponent {
  private readonly store = inject(RequestsStore);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly query = this.store.query;

  protected onInput(event: Event): void {
    this.store.setQuery((event.target as HTMLInputElement).value);
    void this.store.load();
  }

  /** Clearing returns focus to the field so the keyboard journey continues there. */
  protected clear(): void {
    this.store.clearQuery();
    void this.store.load();
    this.input()?.nativeElement.focus();
  }
}
