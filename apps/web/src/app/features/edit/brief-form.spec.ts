import { PenNameRequestDto, RequestStatus, UpdateRequestPayload } from '@nym/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { BriefFormComponent } from './brief-form';

function makeRequest(over: Partial<PenNameRequestDto> = {}): PenNameRequestDto {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: 'Literary historical fiction.',
    refine: '',
    status: RequestStatus.Ready,
    candidates: [
      { id: 'c1', name: 'Bridget C. ASHWORTH', pronunciation: '', origin: '', locked: false },
      { id: 'c2', name: 'Nella P. QUINTRELL', pronunciation: '', origin: '', locked: true },
    ],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedAt: null,
    requestedAt: '2026-07-30T09:14:00.000Z',
    discardedCount: 0,
    errorMessage: '',
    proposedName: 'Bridget C. ASHWORTH',
    checks: [],
    ...over,
  };
}

describe('BriefFormComponent', () => {
  let fixture: ComponentFixture<BriefFormComponent>;

  async function render(request: PenNameRequestDto): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BriefFormComponent);
    fixture.componentRef.setInput('request', request);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [BriefFormComponent],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Fake timers are installed only after rendering: Angular's stabilisation
   *  itself waits on real timers, so faking them earlier would hang the fixture. */
  function withFakeTimers(work: () => void): void {
    vi.useFakeTimers();
    try {
      work();
    } finally {
      vi.useRealTimers();
    }
  }

  describe('the exclusion list', () => {
    it('lists each word of the legal name plus its initials', async () => {
      const element = await render(makeRequest());
      const chips = Array.from(element.querySelectorAll('.exclusions__chip')).map((chip) =>
        chip.textContent?.trim(),
      );

      expect(chips).toEqual(['Margaret', 'Voss', 'M.E.V.']);
    });

    it('prompts for a name when there is nothing to exclude yet', async () => {
      const element = await render(makeRequest({ legalName: '' }));

      expect(element.querySelector('.exclusions__chip')?.textContent?.trim()).toBe('add a name');
      expect(element.querySelector('.exclusions__note')?.textContent).toContain(
        'Enter the legal name',
      );
    });
  });

  describe('labels', () => {
    it('offers a fresh list once candidates exist', async () => {
      const withCandidates = await render(makeRequest());
      expect(withCandidates.textContent).toContain('Start a fresh list');

      const empty = await render(makeRequest({ candidates: [] }));
      expect(empty.textContent).toContain('Generate candidates');
    });

    it('counts the locked names on the regenerate button', async () => {
      const element = await render(makeRequest());

      expect(element.textContent).toContain('Regenerate (1 locked)');
    });

    it('says it is working while a run is in flight', async () => {
      const element = await render(makeRequest({ status: RequestStatus.Generating }));

      expect(element.textContent).toContain('Working…');
    });

    it('marks the prompt button when an override is in use', async () => {
      await render(makeRequest());
      fixture.componentRef.setInput('promptEdited', true);
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Prompt · edited');
    });
  });

  describe('editing', () => {
    it('seeds the form from the request', async () => {
      const element = await render(makeRequest());
      const legalName = element.querySelector('input') as HTMLInputElement;

      expect(legalName.value).toBe('Margaret E. Voss');
    });

    it('autosaves once typing settles, not on every keystroke', async () => {
      const element = await render(makeRequest());
      const saves: UpdateRequestPayload[] = [];
      fixture.componentInstance.briefChange.subscribe((payload) => saves.push(payload));

      withFakeTimers(() => {
        const legalName = element.querySelector('input') as HTMLInputElement;
        legalName.value = 'Margaret E. Vossington';
        legalName.dispatchEvent(new Event('input'));

        vi.advanceTimersByTime(200);
        expect(saves).toHaveLength(0);

        vi.advanceTimersByTime(400);
        expect(saves).toHaveLength(1);
        expect(saves[0]?.legalName).toBe('Margaret E. Vossington');
      });
    });

    it('does not treat a re-seed from the server as an edit', async () => {
      await render(makeRequest());
      const saves: UpdateRequestPayload[] = [];
      fixture.componentInstance.briefChange.subscribe((payload) => saves.push(payload));

      fixture.componentRef.setInput('request', makeRequest({ notes: 'Updated elsewhere.' }));
      await fixture.whenStable();
      withFakeTimers(() => vi.advanceTimersByTime(1000));

      expect(saves).toHaveLength(0);
    });

    it('keeps in-progress edits when a poll only refreshes status or candidates', async () => {
      const element = await render(
        makeRequest({ status: RequestStatus.Generating, candidates: [] }),
      );
      const legalName = element.querySelector('input') as HTMLInputElement;

      legalName.value = 'Margaret E. Vossington';
      legalName.dispatchEvent(new Event('input'));

      fixture.componentRef.setInput(
        'request',
        makeRequest({
          status: RequestStatus.Generating,
          candidates: [
            {
              id: 'c1',
              name: 'Bridget C. ASHWORTH',
              pronunciation: '',
              origin: '',
              locked: false,
            },
          ],
        }),
      );
      await fixture.whenStable();

      expect(legalName.value).toBe('Margaret E. Vossington');
    });

    it('reseeds when the server brief fields actually change', async () => {
      const element = await render(makeRequest());
      const legalName = element.querySelector('input') as HTMLInputElement;

      fixture.componentRef.setInput(
        'request',
        makeRequest({ legalName: 'Ada Lovelace', notes: 'Updated elsewhere.' }),
      );
      await fixture.whenStable();

      expect(legalName.value).toBe('Ada Lovelace');
    });

    it('emits the refine text with the regenerate intent', async () => {
      const element = await render(makeRequest());
      const refines: string[] = [];
      fixture.componentInstance.regenerate.subscribe((refine) => refines.push(refine));

      // Selected by its label: the segmented control contributes radio inputs too.
      const refineField = element.querySelector(
        'input[aria-label="Refine the candidate list"]',
      ) as HTMLInputElement;
      refineField.value = 'shorter surnames';
      refineField.dispatchEvent(new Event('input'));

      const regenerate = Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Regenerate'),
      );
      regenerate?.click();

      expect(refines).toEqual(['shorter surnames']);
    });
  });
});
