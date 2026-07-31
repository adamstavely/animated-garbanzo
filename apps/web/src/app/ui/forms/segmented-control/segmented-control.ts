import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FormControlBase } from '../form-control-base';

export interface SegmentOption {
  value: string;
  label: string;
}

let nextGroup = 0;

/**
 * Segmented single-choice control, used for the pen name's presentation.
 *
 * Built on native radio inputs inside a fieldset: arrow-key navigation, group
 * semantics and the "3 of 3" announcement all come from the platform. The visible
 * segments are the labels; the inputs themselves are visually hidden.
 */
@Component({
  selector: 'nym-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './segmented-control.html',
  styleUrl: './segmented-control.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SegmentedControlComponent),
      multi: true,
    },
  ],
})
export class SegmentedControlComponent extends FormControlBase<string> {
  readonly options = input.required<readonly SegmentOption[]>();

  protected readonly groupName = `nym-segmented-${++nextGroup}`;

  protected select(value: string): void {
    this.commit(value);
  }
}
