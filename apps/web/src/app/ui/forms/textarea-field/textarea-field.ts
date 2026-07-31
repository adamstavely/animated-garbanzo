import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FormControlBase } from '../form-control-base';

/** Multi-line input for notes, the refine steer and the prompt editors. */
@Component({
  selector: 'nym-textarea-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './textarea-field.html',
  styleUrls: ['../field.css', './textarea-field.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaFieldComponent),
      multi: true,
    },
  ],
})
export class TextareaFieldComponent extends FormControlBase<string> {
  readonly rows = input(4);
  /** `mono` tightens the type for the prompt editors. */
  readonly density = input<'default' | 'compact'>('default');

  protected onInput(event: Event): void {
    this.commit((event.target as HTMLTextAreaElement).value);
  }
}
