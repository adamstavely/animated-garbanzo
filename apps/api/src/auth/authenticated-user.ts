import { CurrentUserDto } from '@nym/shared';

/** The signed-in assistant, resolved from the session cookie on every request. */
export interface AuthenticatedUser {
  /** Our own user id, used for foreign keys and audit stamps. */
  id: string;
  /** The IdP `sub` claim. */
  subject: string;
  name: string;
  email: string;
  role: string;
  /** Derived from the IdP role against OIDC_ADMIN_ROLES — not a free-text display field. */
  canAdminister: boolean;
}

/** Express request augmented by {@link SessionAuthGuard}. */
export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Avatar initials: first letters of the first and last words of a display name.
 * "Rosa Marchetti" -> "RM"; a single word gives one letter.
 */
export function initialsFor(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function toCurrentUserDto(user: AuthenticatedUser): CurrentUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: initialsFor(user.name),
    canAdminister: user.canAdminister,
  };
}
