import { Directive, computed, input, signal } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';

let nextId = 0;

/**
 * Shared plumbing for the field components.
 *
 * Each field is a `ControlValueAccessor` so it drops straight into a reactive
 * form, and each generates stable ids to wire `<label for>` and
 * `aria-describedby` without callers having to invent them.
 */
@Directive()
export abstract class FormControlBase<T> implements ControlValueAccessor {
  /** Visible label. Required: every control in the system is labelled. */
  readonly label = input<string>('');
  /** Overrides the accessible name when the visible label is not the right one. */
  readonly ariaLabel = input<string>('');
  /** Help text rendered under the control and referenced by aria-describedby. */
  readonly hint = input<string>('');
  /** Renders a quiet "optional" suffix beside the label. */
  readonly optional = input(false);
  readonly placeholder = input<string>('');

  protected readonly controlId = `nym-field-${++nextId}`;
  protected readonly hintId = `${this.controlId}-hint`;

  protected readonly value = signal<T | null>(null);
  protected readonly disabled = signal(false);

  protected readonly describedBy = computed(() => (this.hint() ? this.hintId : null));

  private notifyChange: (value: T) => void = () => undefined;
  private notifyTouched: () => void = () => undefined;

  writeValue(value: T | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T) => void): void {
    this.notifyChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.notifyTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected commit(value: T): void {
    this.value.set(value);
    this.notifyChange(value);
  }

  protected touch(): void {
    this.notifyTouched();
  }
}
