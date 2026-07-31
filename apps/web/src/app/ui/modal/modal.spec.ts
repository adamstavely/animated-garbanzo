import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalComponent } from './modal';

/** Host with a trigger outside the dialog, so focus restoration can be observed. */
@Component({
  imports: [ModalComponent],
  template: `
    <button id="trigger" (click)="open.set(true)">Open</button>
    @if (open()) {
      <nym-modal heading="Are you sure?" eyebrow="Delete request" (dismissed)="dismissed()">
        <p>Body copy</p>
        <button modalFooter id="confirm">Confirm</button>
      </nym-modal>
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly onDismiss = vi.fn();

  dismissed(): void {
    this.onDismiss();
    this.open.set(false);
  }
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [HostComponent],
    });

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  async function open(): Promise<void> {
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
  }

  it('exposes a labelled dialog to assistive technology', async () => {
    await open();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const labelId = dialog.getAttribute('aria-labelledby');
    const label = fixture.nativeElement.querySelector(`#${labelId}`) as HTMLElement;
    expect(label.textContent?.trim()).toBe('Are you sure?');
  });

  it('renders the title as a heading, not just styled text', async () => {
    await open();

    expect(fixture.nativeElement.querySelector('h2.modal__heading')).not.toBeNull();
  });

  it('gives the close button an accessible name', async () => {
    await open();

    const close = fixture.nativeElement.querySelector('.modal__close') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close');
  });

  it('dismisses on Escape', async () => {
    await open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a click on the scrim', async () => {
    await open();

    (fixture.nativeElement.querySelector('.modal__scrim') as HTMLElement).click();
    await fixture.whenStable();

    expect(host.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on a click inside the panel', async () => {
    await open();

    (fixture.nativeElement.querySelector('.modal__panel') as HTMLElement).click();
    await fixture.whenStable();

    expect(host.onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses via the close button', async () => {
    await open();

    (fixture.nativeElement.querySelector('.modal__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(host.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog when it opens', async () => {
    await open();

    const panel = fixture.nativeElement.querySelector('.modal__panel') as HTMLElement;
    const active = document.activeElement as HTMLElement | null;

    expect(active?.id).not.toBe('trigger');
    expect(panel.contains(active)).toBe(true);
  });

  it('returns focus to whatever opened it', async () => {
    await open();

    (fixture.nativeElement.querySelector('.modal__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect((document.activeElement as HTMLElement).id).toBe('trigger');
  });

  it('projects body and footer content into their own regions', async () => {
    await open();

    expect(fixture.nativeElement.querySelector('.modal__body')?.textContent).toContain('Body copy');
    expect(fixture.nativeElement.querySelector('.modal__footer')?.textContent).toContain('Confirm');
  });
});
