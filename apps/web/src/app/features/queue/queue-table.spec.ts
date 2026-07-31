import { CheckId, PenNameRequestDto, RequestStatus } from '@nym/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

import { QueueTableComponent } from './queue-table';

function makeRequest(over: Partial<PenNameRequestDto> = {}): PenNameRequestDto {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: '',
    refine: '',
    status: RequestStatus.Ready,
    candidates: [],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedAt: null,
    requestedAt: new Date(2026, 6, 30, 9, 14).toISOString(),
    discardedCount: 4,
    errorMessage: '',
    proposedName: 'Bridget C. ASHWORTH',
    checks: [
      {
        id: CheckId.Overlap,
        passLabel: 'No name overlap',
        failLabel: 'Overlaps legal name',
        passed: true,
      },
      {
        id: CheckId.PriorUse,
        passLabel: 'No prior use',
        failLabel: 'Prior use found',
        passed: true,
      },
      {
        id: CheckId.Famous,
        passLabel: 'Not a famous name',
        failLabel: 'Resembles a famous name',
        passed: true,
      },
      {
        id: CheckId.Offensive,
        passLabel: 'No offensive terms',
        failLabel: 'Contains offensive terms',
        passed: true,
      },
    ],
    ...over,
  };
}

describe('QueueTableComponent', () => {
  let fixture: ComponentFixture<QueueTableComponent>;

  async function render(requests: PenNameRequestDto[]): Promise<HTMLElement> {
    fixture = TestBed.createComponent(QueueTableComponent);
    fixture.componentRef.setInput('requests', requests);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
      imports: [QueueTableComponent],
    });
  });

  describe('semantics', () => {
    it('exposes a table with a caption and column headers', async () => {
      const element = await render([makeRequest()]);

      expect(element.querySelector('[role="table"]')).not.toBeNull();
      expect(element.querySelector('caption')?.textContent).toContain('Open pen name requests');

      const headers = Array.from(element.querySelectorAll('[role="columnheader"]')).map((header) =>
        header.textContent?.trim(),
      );
      expect(headers).toEqual([
        'Legal name',
        'Proposed pen name',
        'Checks',
        'Requested',
        'Status',
        'Action',
      ]);
    });

    it('gives every row the same number of cells as there are columns', async () => {
      const element = await render([
        makeRequest(),
        makeRequest({ id: 'r2', status: RequestStatus.Generating, proposedName: '', checks: [] }),
      ]);

      const rows = element.querySelectorAll('tbody [role="row"]');
      expect(rows).toHaveLength(2);
      rows.forEach((row) => {
        expect(row.querySelectorAll('[role="cell"]')).toHaveLength(6);
      });
    });
  });

  describe('content', () => {
    it('shows the legal name, the proposed name and the timestamp', async () => {
      const element = await render([makeRequest()]);

      expect(element.querySelector('.table__author')?.textContent).toContain('Margaret E. Voss');
      expect(element.querySelector('.table__pen-name')?.textContent).toContain(
        'Bridget C. ASHWORTH',
      );
      expect(element.querySelector('.table__stamp')?.textContent?.trim()).toBe(
        '30 Jul 2026 · 09:14',
      );
    });

    it('renders all four checks', async () => {
      const element = await render([makeRequest()]);

      expect(element.querySelectorAll('nym-check-line')).toHaveLength(4);
    });

    it('holds the checks column open with a placeholder while generating', async () => {
      const element = await render([
        makeRequest({ status: RequestStatus.Generating, proposedName: '', checks: [] }),
      ]);

      expect(element.querySelector('.table__checks-placeholder')?.textContent?.trim()).toBe('—');
      expect(element.querySelector('nym-spinner')).not.toBeNull();
    });

    it('shows the failure reason inline on a failed row', async () => {
      const element = await render([
        makeRequest({
          status: RequestStatus.Failed,
          errorMessage: 'Generation failed — try again.',
          checks: [],
        }),
      ]);

      expect(element.querySelector('.table__error')?.textContent).toContain('Generation failed');
    });
  });

  describe('actions', () => {
    it('offers Retry only when the last run failed', async () => {
      const ready = await render([makeRequest()]);
      expect(ready.textContent).not.toContain('Retry');

      const failed = await render([makeRequest({ status: RequestStatus.Failed, checks: [] })]);
      expect(failed.textContent).toContain('Retry');
    });

    it('offers Approve only when there is a cleared name to approve', async () => {
      const ready = await render([makeRequest()]);
      expect(ready.textContent).toContain('Approve');

      const generating = await render([
        makeRequest({ status: RequestStatus.Generating, proposedName: '', checks: [] }),
      ]);
      expect(generating.textContent).not.toContain('Approve');
    });

    it('always offers Edit, as a link to the request', async () => {
      const element = await render([makeRequest()]);
      const edit = element.querySelector('a.table__link-button') as HTMLAnchorElement;

      expect(edit.getAttribute('href')).toBe('/requests/r1');
      expect(edit.getAttribute('aria-label')).toBe('Edit the request for Margaret E. Voss');
    });

    it('names each row action with the author it applies to', async () => {
      const element = await render([makeRequest()]);
      const approve = Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Approve'),
      );

      expect(approve?.getAttribute('aria-label')).toBe(
        'Approve Bridget C. ASHWORTH for Margaret E. Voss',
      );
    });

    it('raises approve and retry for the row that was acted on', async () => {
      const element = await render([makeRequest({ status: RequestStatus.Failed, checks: [] })]);
      const component = fixture.componentInstance;

      const approved: PenNameRequestDto[] = [];
      const retried: PenNameRequestDto[] = [];
      component.approve.subscribe((request) => approved.push(request));
      component.retry.subscribe((request) => retried.push(request));

      const retry = Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Retry'),
      );
      retry?.click();
      await fixture.whenStable();

      expect(retried.map((request) => request.id)).toEqual(['r1']);
      expect(approved).toHaveLength(0);
    });
  });
});
