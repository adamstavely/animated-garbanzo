import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { AuthenticatedUser } from './authenticated-user';
import { IS_PUBLIC_KEY } from './decorators';
import { SessionService } from './session.service';

/**
 * Global guard: every endpoint requires a valid session cookie unless it is
 * explicitly marked `@Public()`. Defaulting to "closed" means a new controller
 * cannot accidentally ship unauthenticated.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = request.cookies?.[this.sessions.cookieName] as string | undefined;
    const user = await this.sessions.verify(token);

    if (!user) {
      throw new UnauthorizedException('Sign in to continue.');
    }

    request.user = user;
    return true;
  }
}
