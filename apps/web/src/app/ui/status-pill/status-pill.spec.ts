import { RequestStatus } from '@nym/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { StatusPillComponent } from './status-pill';

describe('StatusPillComponent', () => {
  let fixture: ComponentFixture<StatusPillComponent>;

  async function render(status: RequestStatus): Promise<HTMLElement> {
    fixture = TestBed.createComponent(StatusPillComponent);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [StatusPillComponent],
    });
  });

  it.each([
    [RequestStatus.Ready, 'Ready', 'pill--wait'],
    [RequestStatus.Approved, 'Approved', 'pill--pass'],
    [RequestStatus.Failed, 'Failed', 'pill--fail'],
    [RequestStatus.Queued, 'Queued', 'pill--neutral'],
    [RequestStatus.Generating, 'Generating', 'pill--neutral'],
  ])('renders %s as "%s"', async (status, label, toneClass) => {
    const element = await render(status);

    expect(element.textContent?.trim()).toBe(label);
    expect(element.querySelector('.pill')?.className).toContain(toneClass);
  });

  it('always carries a word, so status is never colour alone', async () => {
    for (const status of Object.values(RequestStatus)) {
      const element = await render(status);
      expect(element.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('hides the decorative dot from assistive technology', async () => {
    const element = await render(RequestStatus.Ready);

    expect(element.querySelector('.pill__dot')?.getAttribute('aria-hidden')).toBe('true');
  });
});
