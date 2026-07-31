import { CheckId, CheckOutcome, CheckResult } from '@nym/shared';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { CheckLineComponent } from './check-line';

const overlapCheck = (outcome: CheckOutcome): CheckResult => ({
  id: CheckId.Overlap,
  passLabel: 'No name overlap',
  failLabel: 'Overlaps legal name',
  unknownLabel: 'Overlap unchecked',
  outcome,
});

describe('CheckLineComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [CheckLineComponent],
    });
  });

  async function render(check: CheckResult): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(CheckLineComponent);
    fixture.componentRef.setInput('check', check);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('states the pass wording in green with a tick', async () => {
    const element = await render(overlapCheck('passed'));

    expect(element.textContent).toContain('No name overlap');
    expect(element.querySelector('.check')?.className).toContain('check--pass');
  });

  it('states the failure wording in red with a cross', async () => {
    const element = await render(overlapCheck('failed'));

    expect(element.textContent).toContain('Overlaps legal name');
    expect(element.querySelector('.check')?.className).toContain('check--fail');
  });

  it('states the unknown wording in muted tone when unverified', async () => {
    const element = await render(overlapCheck('unknown'));

    expect(element.textContent).toContain('Overlap unchecked');
    expect(element.querySelector('.check')?.className).toContain('check--unknown');
  });

  it('changes the words as well as the hue, so the outcome is not colour alone', async () => {
    const passed = (await render(overlapCheck('passed'))).textContent?.trim();
    const failed = (await render(overlapCheck('failed'))).textContent?.trim();
    const unknown = (await render(overlapCheck('unknown'))).textContent?.trim();

    expect(passed).not.toBe(failed);
    expect(passed).not.toBe(unknown);
    expect(failed).not.toBe(unknown);
  });

  it('hides the glyph from assistive technology, since the label carries it', async () => {
    const element = await render(overlapCheck('passed'));

    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
