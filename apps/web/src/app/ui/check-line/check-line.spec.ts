import { CheckId, CheckResult } from '@nym/shared';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { CheckLineComponent } from './check-line';

const overlapCheck = (passed: boolean): CheckResult => ({
  id: CheckId.Overlap,
  passLabel: 'No name overlap',
  failLabel: 'Overlaps legal name',
  passed,
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
    const element = await render(overlapCheck(true));

    expect(element.textContent).toContain('No name overlap');
    expect(element.querySelector('.check')?.className).toContain('check--pass');
  });

  it('states the failure wording in red with a cross', async () => {
    const element = await render(overlapCheck(false));

    expect(element.textContent).toContain('Overlaps legal name');
    expect(element.querySelector('.check')?.className).toContain('check--fail');
  });

  it('changes the words as well as the hue, so the outcome is not colour alone', async () => {
    const passed = (await render(overlapCheck(true))).textContent?.trim();
    const failed = (await render(overlapCheck(false))).textContent?.trim();

    expect(passed).not.toBe(failed);
  });

  it('hides the glyph from assistive technology, since the label carries it', async () => {
    const element = await render(overlapCheck(true));

    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
