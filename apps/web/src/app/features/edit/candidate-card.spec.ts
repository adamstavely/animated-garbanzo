import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { CandidateCardComponent } from './candidate-card';

@Component({
  template: `
    <nym-candidate-card
      [candidate]="candidate"
      [legalName]="legalName()"
      [interactive]="interactive()"
    />
  `,
  imports: [CandidateCardComponent],
})
class HostComponent {
  candidate = {
    id: 'c1',
    name: 'Bridget C. ASHWORTH',
    pronunciation: '',
    origin: '',
    locked: false,
  };
  readonly legalName = signal('Margaret E. Voss');
  readonly interactive = signal(true);
}

describe('CandidateCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows a live overlap pass against the current legal name', () => {
    expect(fixture.nativeElement.textContent).toContain('No overlap');
    expect(fixture.nativeElement.textContent).toContain('Prior use unverified');
  });

  it('flips overlap to failed when the legal name collides', async () => {
    host.legalName.set('Bridget A. Voss');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Overlaps legal name');
    expect(fixture.nativeElement.textContent).not.toContain('No overlap');

    const select = fixture.nativeElement.querySelector(
      'button.candidate__select',
    ) as HTMLButtonElement;
    expect(select.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.candidate--blocked')).toBeTruthy();
  });

  it('disables select and lock when not interactive', async () => {
    host.interactive.set(false);
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '.candidate__select',
    ) as HTMLButtonElement;
    const lock = fixture.nativeElement.querySelector('.candidate__lock') as HTMLButtonElement;

    expect(select.disabled).toBe(true);
    expect(lock.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.candidate--inert')).toBeTruthy();
  });
});
