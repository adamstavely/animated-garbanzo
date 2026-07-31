import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedUser } from './authenticated-user';
import { REQUIRE_ADMIN_KEY } from './decorators';

/**
 * Enforces {@link RequireAdmin} on handlers that mutate shared desk controls.
 * Registered globally; endpoints without the metadata are left alone.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user?.canAdminister) {
      throw new ForbiddenException(
        'This action requires a desk-admin role from the identity provider.',
      );
    }

    return true;
  }
}
