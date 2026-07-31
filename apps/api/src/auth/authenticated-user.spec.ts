import { AuthenticatedUser, initialsFor, toCurrentUserDto } from './authenticated-user';

describe('initialsFor', () => {
  it.each([
    ['Rosa Marchetti', 'RM'],
    ['rosa marchetti', 'RM'],
    ['Rosa Maria Marchetti', 'RM'],
    ['Rosa', 'R'],
    ['  Rosa   Marchetti  ', 'RM'],
  ])('%s -> %s', (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });

  it('falls back rather than rendering an empty avatar', () => {
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('toCurrentUserDto', () => {
  it('exposes only what the header needs', () => {
    const user: AuthenticatedUser = {
      id: 'u1',
      subject: 'oidc|abc',
      name: 'Rosa Marchetti',
      email: 'rosa@example.com',
      role: 'Publishing assistant · Trade',
    };

    expect(toCurrentUserDto(user)).toEqual({
      id: 'u1',
      name: 'Rosa Marchetti',
      email: 'rosa@example.com',
      role: 'Publishing assistant · Trade',
      initials: 'RM',
    });
  });
});
