import { CurrentUserDto, SuiteAppDto } from '@nym/shared';
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { AppConfig } from '../config/configuration';
import { AuthenticatedUser, toCurrentUserDto } from './authenticated-user';
import { CurrentUser, Public } from './decorators';
import { OidcService } from './oidc.service';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

/** The publishing suite the app picker switches between. */
const SUITE_APPS: readonly SuiteAppDto[] = [
  { name: 'Nym', description: 'Pen name desk', href: '/', current: true },
  { name: 'Manuscripts', description: 'Submissions and reads', href: '#', current: false },
  { name: 'Rights', description: 'Territories and licensing', href: '#', current: false },
  { name: 'Catalogue', description: 'Seasonal lists and metadata', href: '#', current: false },
  { name: 'Jackets', description: 'Cover design workflow', href: '#', current: false },
];

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /** Where the browser lands once a session exists. */
  private readonly webAppUrl: string;
  /** Configured OIDC redirect URI — the only host we trust for the code exchange. */
  private readonly oidcRedirectUri: string;

  constructor(
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.webAppUrl = configService.get('webAppUrl', { infer: true });
    this.oidcRedirectUri = configService.get('oidc', { infer: true }).redirectUri;
  }

  @Public()
  @Get('login')
  @ApiOperation({ summary: 'Starts the OIDC authorization code flow.' })
  async login(@Res() response: Response): Promise<void> {
    const { url, transaction } = await this.oidc.createAuthorizationRequest();
    await this.sessions.storeTransaction(response, transaction);
    response.redirect(url);
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'OIDC redirect target; exchanges the code for a session.' })
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const transaction = await this.sessions.readTransaction(
      request.cookies?.[this.sessions.transactionCookieName] as string | undefined,
    );
    this.sessions.clearTransaction(response);

    if (!transaction) {
      response.redirect(`${this.webAppUrl}?auth=expired`);
      return;
    }

    // Build the callback URL from the configured redirect URI + the query the
    // IdP appended. Never trust Host / X-Forwarded-* for the code exchange.
    const currentUrl = new URL(this.oidcRedirectUri);
    const incoming = new URL(request.originalUrl, 'http://127.0.0.1');
    currentUrl.search = incoming.search;

    try {
      const profile = await this.oidc.exchange(currentUrl.href, transaction);
      const user = await this.users.upsertFromProfile(profile);
      await this.sessions.issue(response, user);
    } catch {
      // Match the expired-TX path: send the browser home with a marker rather
      // than leaving it on the API host staring at UnauthorizedException JSON.
      response.redirect(`${this.webAppUrl}?auth=failed`);
      return;
    }

    response.redirect(this.webAppUrl);
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in assistant, for the avatar and account menu.' })
  @ApiOkResponse({ description: 'The current user profile.' })
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserDto {
    return toCurrentUserDto(user);
  }

  @Get('apps')
  @ApiOperation({ summary: 'Entries shown in the publishing-suite app picker.' })
  apps(@Query('current') current?: string): SuiteAppDto[] {
    const currentApp = current ?? 'Nym';
    return SUITE_APPS.map((app) => ({ ...app, current: app.name === currentApp }));
  }
}
