import { escapeIlikePattern } from './ilike';

describe('escapeIlikePattern', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeIlikePattern('voss')).toBe('voss');
  });

  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeIlikePattern('%')).toBe('\\%');
    expect(escapeIlikePattern('_')).toBe('\\_');
    expect(escapeIlikePattern('a\\b%c_d')).toBe('a\\\\b\\%c\\_d');
  });
});
