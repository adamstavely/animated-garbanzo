import {
  RejectionReason,
  composeLegalName,
  hasMiddleInitial,
  overlapsLegalName,
  screenCandidates,
  upperCaseSurname,
} from './name-rules';
import { RawCandidate } from './name-rules';

/**
 * The screening rules are the product. These tests pin every clause of section 5
 * of the style guide, because a regression here would let a name through that
 * shares ground with the author's real one.
 */
describe('overlapsLegalName', () => {
  const legalName = 'Margaret E. Voss';

  it('rejects a candidate reusing a whole word from the legal name', () => {
    expect(overlapsLegalName('Margaret T. Bland', legalName)).toBe(true);
    expect(overlapsLegalName('Delia R. Voss', legalName)).toBe(true);
  });

  it('rejects a candidate whose word starts with any initial of the legal name', () => {
    // M from Margaret, V from Voss, E from the middle initial.
    expect(overlapsLegalName('Wren M. Talbot', legalName)).toBe(true);
    expect(overlapsLegalName('Delia R. Vance', legalName)).toBe(true);
    expect(overlapsLegalName('Delia R. Easton', legalName)).toBe(true);
  });

  it('rejects a shared three-letter phonetic stem', () => {
    expect(overlapsLegalName('Delia R. Vossler', 'Anna B. Vossington')).toBe(true);
  });

  it('rejects a candidate word that contains a legal name word', () => {
    expect(overlapsLegalName('Delia R. Ashworthy', 'Priya K. Ashworth')).toBe(true);
  });

  it("rejects a middle initial matching any of the legal name's initials", () => {
    expect(overlapsLegalName('Delia E. Thorpe', legalName)).toBe(true);
    expect(overlapsLegalName('Delia M. Thorpe', legalName)).toBe(true);
  });

  it('accepts a candidate that shares nothing', () => {
    expect(overlapsLegalName('Bridget C. Ashworth', legalName)).toBe(false);
  });

  it('ignores case and punctuation', () => {
    expect(overlapsLegalName('margaret c. bland', legalName)).toBe(true);
    expect(overlapsLegalName("Bridget C. O'Ashworth", legalName)).toBe(false);
  });

  it('treats hyphenated legal names as separate words', () => {
    expect(overlapsLegalName('Rhys T. Okonkwo', 'Daniel O. Okonkwo-Reyes')).toBe(true);
  });

  it('returns false when either side has no comparable words', () => {
    expect(overlapsLegalName('Bridget C. Ashworth', '')).toBe(false);
    expect(overlapsLegalName('', 'Margaret E. Voss')).toBe(false);
  });
});

describe('hasMiddleInitial', () => {
  it.each([
    ['Margot A. Selden', true],
    ['Bridget C. ASHWORTH', true],
    ['Margot Selden', false],
    ['Selden', false],
    ['Margot Anne Selden', false],
  ])('%s -> %s', (name, expected) => {
    expect(hasMiddleInitial(name)).toBe(expected);
  });
});

describe('upperCaseSurname', () => {
  it('upper-cases only the final word', () => {
    expect(upperCaseSurname('Bridget C. Ashworth')).toBe('Bridget C. ASHWORTH');
  });

  it('leaves a single-word name alone', () => {
    expect(upperCaseSurname('Ashworth')).toBe('Ashworth');
  });

  it('tolerates untidy whitespace', () => {
    expect(upperCaseSurname('  Bridget   C.  Ashworth ')).toBe('Bridget C. ASHWORTH');
  });
});

describe('composeLegalName', () => {
  it('joins the three intake fields with a period after the initial', () => {
    expect(composeLegalName('Margaret', 'E', 'Voss')).toBe('Margaret E. Voss');
  });

  it('upper-cases and truncates the middle initial', () => {
    expect(composeLegalName('Margaret', 'ellen', 'Voss')).toBe('Margaret E. Voss');
  });

  it('omits the middle initial when it is absent', () => {
    expect(composeLegalName('Margaret', '', 'Voss')).toBe('Margaret Voss');
    expect(composeLegalName('Margaret', undefined, 'Voss')).toBe('Margaret Voss');
  });

  it('tolerates a missing part', () => {
    expect(composeLegalName('', 'E', 'Voss')).toBe('E. Voss');
    expect(composeLegalName('', '', '')).toBe('');
  });
});

describe('screenCandidates', () => {
  const legalName = 'Margaret E. Voss';

  const candidate = (over: Partial<RawCandidate> = {}): RawCandidate => ({
    name: 'Bridget C. Ashworth',
    pronunciation: 'BRIJ-it ASH-worth',
    origin: 'Anglo-Irish',
    priorUse: false,
    ...over,
  });

  it('accepts a clean candidate and upper-cases its surname', () => {
    const result = screenCandidates([candidate()], { legalName, limit: 15 });

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toEqual([
      {
        name: 'Bridget C. ASHWORTH',
        pronunciation: 'BRIJ-it ASH-worth',
        origin: 'Anglo-Irish',
      },
    ]);
  });

  it('discards a candidate the model flagged for prior use', () => {
    const result = screenCandidates([candidate({ priorUse: true, priorUseWho: 'A novelist' })], {
      legalName,
      limit: 15,
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]).toMatchObject({
      reason: RejectionReason.PriorUse,
      detail: 'A novelist',
    });
  });

  it('discards a candidate that overlaps the legal name', () => {
    const result = screenCandidates([candidate({ name: 'Margaret C. Ashworth' })], {
      legalName,
      limit: 15,
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe(RejectionReason.Overlap);
  });

  it('discards a candidate with no middle initial', () => {
    const result = screenCandidates([candidate({ name: 'Bridget Ashworth' })], {
      legalName,
      limit: 15,
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe(RejectionReason.MissingMiddleInitial);
  });

  it('discards empty and absurdly long names as malformed', () => {
    const result = screenCandidates(
      [candidate({ name: '   ' }), candidate({ name: `${'A'.repeat(200)} B. Ashworth` })],
      { legalName, limit: 15 },
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((rejection) => rejection.reason)).toEqual([
      RejectionReason.Malformed,
      RejectionReason.Malformed,
    ]);
  });

  it('de-duplicates within a pass, case-insensitively', () => {
    const result = screenCandidates([candidate(), candidate({ name: 'bridget c. ashworth' })], {
      legalName,
      limit: 15,
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe(RejectionReason.Duplicate);
  });

  it('does not re-offer a name that is already locked', () => {
    const result = screenCandidates([candidate()], {
      legalName,
      reservedNames: ['Bridget C. ASHWORTH'],
      limit: 15,
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe(RejectionReason.Duplicate);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      candidate({ name: `Bridget C. Ashwort${String.fromCharCode(97 + index)}` }),
    );

    const result = screenCandidates(many, { legalName, limit: 3 });

    expect(result.accepted).toHaveLength(3);
  });

  it('tolerates missing optional fields from the model', () => {
    const result = screenCandidates([{ name: 'Bridget C. Ashworth' }], { legalName, limit: 15 });

    expect(result.accepted[0]).toEqual({
      name: 'Bridget C. ASHWORTH',
      pronunciation: '',
      origin: '',
    });
  });

  it('truncates over-long pronunciation and origin notes', () => {
    const result = screenCandidates(
      [candidate({ pronunciation: 'x'.repeat(400), origin: 'y'.repeat(900) })],
      { legalName, limit: 15 },
    );

    expect(result.accepted[0]?.pronunciation).toHaveLength(255);
    expect(result.accepted[0]?.origin).toHaveLength(500);
  });
});
