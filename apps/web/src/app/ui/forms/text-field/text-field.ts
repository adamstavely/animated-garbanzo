import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FormControlBase } from '../form-control-base';

/** Single-line text input with its label, hint and optional marker. */
@Component({
  selector: 'nym-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './text-field.html',
  styleUrls: ['../field.css', './text-field.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextFieldComponent),
      multi: true,
    },
  ],
})
export class TextFieldComponent extends FormControlBase<string> {
  /** Caps input length, e.g. the single-letter middle initial. */
  readonly maxLength = input<number | null>(null);
  /** Centres the text, used by the middle-initial box. */
  readonly align = input<'start' | 'center'>('start');
  /** Upper-cases as the assistant types; the middle initial is always a capital. */
  readonly forceUppercase = input(false);
  readonly autocomplete = input<string>('off');

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = this.forceUppercase() ? input.value.toUpperCase() : input.value;
    if (next !== input.value) {
      input.value = next;
    }
    this.commit(next);
  }
}
