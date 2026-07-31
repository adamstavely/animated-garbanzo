import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CookieOptions, Response } from 'express';

import { AppConfig } from '../config/configuration';
import { AuthenticatedUser } from './authenticated-user';

/** Claims carried by the session cookie. */
interface SessionClaims {
  sub: string;
  oid: string;
  name: string;
  email: string;
  role: string;
}

/** Short-lived state carried between the authorize redirect and the callback. */
export interface OidcTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
}

const TRANSACTION_COOKIE = 'nym_oidc_tx';
const TRANSACTION_TTL_SECONDS = 600;

/**
 * Issues and reads the application session.
 *
 * After the OIDC exchange we mint our own short-lived JWT and put it in an
 * httpOnly, SameSite=Lax cookie. That keeps the IdP tokens off the browser
 * entirely and means no server-side session store is needed.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly session: AppConfig['session'];

  constructor(
    private readonly jwt: JwtService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.session = configService.get('session', { infer: true });
  }

  async issue(response: Response, user: AuthenticatedUser): Promise<void> {
    const token = await this.jwt.signAsync(
      {
        sub: user.subject,
        oid: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      } satisfies SessionClaims,
      { expiresIn: this.session.ttlSeconds },
    );

    response.cookie(this.session.cookieName, token, this.cookieOptions(this.session.ttlSeconds));
  }

  async verify(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token) {
      return null;
    }

    try {
      const claims = await this.jwt.verifyAsync<SessionClaims>(token);
      return {
        id: claims.oid,
        subject: claims.sub,
        name: claims.name,
        email: claims.email,
        role: claims.role,
      };
    } catch (error) {
      this.logger.debug(
        `Rejected session cookie: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  clear(response: Response): void {
    response.clearCookie(this.session.cookieName, this.cookieOptions(0));
  }

  async storeTransaction(response: Response, transaction: OidcTransaction): Promise<void> {
    const token = await this.jwt.signAsync(transaction, { expiresIn: TRANSACTION_TTL_SECONDS });
    response.cookie(TRANSACTION_COOKIE, token, this.cookieOptions(TRANSACTION_TTL_SECONDS));
  }

  async readTransaction(token: string | undefined): Promise<OidcTransaction | null> {
    if (!token) {
      return null;
    }
    try {
      const { state, nonce, codeVerifier } = await this.jwt.verifyAsync<OidcTransaction>(token);
      return { state, nonce, codeVerifier };
    } catch {
      return null;
    }
  }

  clearTransaction(response: Response): void {
    response.clearCookie(TRANSACTION_COOKIE, this.cookieOptions(0));
  }

  get cookieName(): string {
    return this.session.cookieName;
  }

  get transactionCookieName(): string {
    return TRANSACTION_COOKIE;
  }

  private cookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.session.secureCookie,
      sameSite: 'lax',
      path: '/',
      domain: this.session.cookieDomain,
      maxAge: maxAgeSeconds * 1000,
    };
  }
}
