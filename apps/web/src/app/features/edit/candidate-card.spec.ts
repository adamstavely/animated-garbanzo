import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { CandidateCardComponent } from './candidate-card';

@Component({
  template: `
    <nym-candidate-card [candidate]="candidate" [legalName]="legalName()" />
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
  });
});
