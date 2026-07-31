import { canAdministerRole } from './privileges';

describe('canAdministerRole', () => {
  it('opens the desk outside production when no admin roles are configured', () => {
    expect(canAdministerRole('Publishing assistant', [], false)).toBe(true);
  });

  it('locks the desk in production until admin roles are configured', () => {
    expect(canAdministerRole('Publishing assistant', [], true)).toBe(false);
  });

  it('matches an exact admin role, case-insensitively', () => {
    expect(canAdministerRole('Desk lead', ['Desk lead', 'Admin'], true)).toBe(true);
    expect(canAdministerRole('admin', ['Admin'], true)).toBe(true);
  });

  it('matches a display role that starts with an admin title', () => {
    expect(canAdministerRole('Admin · Trade', ['Admin'], true)).toBe(true);
  });

  it('refuses unrelated roles', () => {
    expect(canAdministerRole('Publishing assistant · Trade', ['Admin'], true)).toBe(false);
  });
});
