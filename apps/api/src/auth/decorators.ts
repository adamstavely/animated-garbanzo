import {
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';

import { AuthenticatedUser } from './authenticated-user';

export const IS_PUBLIC_KEY = 'nym:isPublic';

/** Opts an endpoint out of the global session guard (health checks, the OIDC dance). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Injects the signed-in assistant. Throws rather than returning undefined so a
 * handler can never silently operate without an identity.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new UnauthorizedException('No authenticated user on the request.');
    }
    return request.user;
  },
);
