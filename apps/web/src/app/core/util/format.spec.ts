import {
  formatAlternates,
  formatRequestMeta,
  formatScreening,
  formatStamp,
  pluralise,
} from './format';

describe('formatStamp', () => {
  it('renders the "30 Jul 2026 · 09:14" form the column is sized for', () => {
    // Built from local parts so the assertion holds in any timezone.
    const date = new Date(2026, 6, 30, 9, 14);

    expect(formatStamp(date.toISOString())).toBe('30 Jul 2026 · 09:14');
  });

  it('pads the clock to two digits', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 5).toISOString())).toBe('5 Jan 2026 · 07:05');
  });

  it('renders nothing for an absent or unparseable value', () => {
    expect(formatStamp(null)).toBe('');
    expect(formatStamp(undefined)).toBe('');
    expect(formatStamp('not a date')).toBe('');
  });
});

describe('formatRequestMeta', () => {
  it('joins the presentation and origin', () => {
    expect(formatRequestMeta('Female', 'Anglo-Irish')).toBe('Female · Anglo-Irish');
  });

  it('says so when no origin was chosen', () => {
    expect(formatRequestMeta('Unisex', '')).toBe('Unisex · No origin set');
  });
});

describe('formatAlternates', () => {
  it.each([
    [3, false, '+2 alternates'],
    [1, false, 'only candidate'],
    [0, false, ''],
    [4, true, 'Approved from 4 cleared candidates'],
  ])('%s candidates, approved=%s -> %s', (count, approved, expected) => {
    expect(formatAlternates(count, approved)).toBe(expected);
  });
});

describe('formatScreening', () => {
  it('reports the discard count, or that everything cleared', () => {
    expect(formatScreening(4)).toBe('4 discarded in screening');
    expect(formatScreening(0)).toBe('all candidates cleared');
  });
});

describe('pluralise', () => {
  it('uses the singular only for one', () => {
    expect(pluralise(1, 'name')).toBe('name');
    expect(pluralise(2, 'name')).toBe('names');
    expect(pluralise(0, 'match', 'matches')).toBe('matches');
  });
});
