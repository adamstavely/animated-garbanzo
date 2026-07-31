import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideChevronDown } from '@lucide/angular';

import { FormControlBase } from '../form-control-base';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Native `<select>` with the system's chrome.
 *
 * Deliberately native: the origin list is 38 entries, and the platform control
 * brings type-ahead, mobile pickers and screen reader support that a custom
 * listbox would have to re-earn.
 */
@Component({
  selector: 'nym-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideChevronDown],
  templateUrl: './select-field.html',
  styleUrls: ['../field.css', './select-field.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectFieldComponent),
      multi: true,
    },
  ],
})
export class SelectFieldComponent extends FormControlBase<string> {
  readonly options = input.required<readonly SelectOption[]>();

  protected onSelect(event: Event): void {
    this.commit((event.target as HTMLSelectElement).value);
  }
}
