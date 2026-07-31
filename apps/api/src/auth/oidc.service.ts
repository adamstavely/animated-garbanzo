import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Issuer, generators } from 'openid-client';

import { AppConfig } from '../config/configuration';
import { OidcTransaction } from './session.service';

/** Identity claims we care about, after mapping the configured claim names. */
export interface OidcProfile {
  subject: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Standards-based OIDC authorization code flow with PKCE.
 *
 * Provider metadata is discovered from the issuer's well-known document, so the
 * same code works against Entra ID, Okta, Auth0 or Keycloak — only the issuer,
 * client credentials and claim names change per environment.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name);
  private readonly settings: AppConfig['oidc'];
  private client?: Client;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.settings = configService.get('oidc', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    // Discovery is attempted eagerly so a bad issuer shows up at boot, but a
    // transient failure must not stop the API serving; it is retried lazily.
    try {
      await this.discover();
    } catch (error) {
      this.logger.error(`OIDC discovery failed for ${this.settings.issuerUrl}: ${describe(error)}`);
    }
  }

  /** Builds the authorize URL and the transaction state the callback will verify. */
  async createAuthorizationRequest(): Promise<{ url: string; transaction: OidcTransaction }> {
    const client = await this.discover();

    const codeVerifier = generators.codeVerifier();
    const state = generators.state();
    const nonce = generators.nonce();

    const url = client.authorizationUrl({
      scope: this.settings.scopes,
      redirect_uri: this.settings.redirectUri,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return { url, transaction: { state, nonce, codeVerifier } };
  }

  /** Exchanges the authorization code and returns the mapped profile claims. */
  async exchange(currentUrl: string, transaction: OidcTransaction): Promise<OidcProfile> {
    const client = await this.discover();

    try {
      const parameters = client.callbackParams(currentUrl);
      const tokenSet = await client.callback(this.settings.redirectUri, parameters, {
        code_verifier: transaction.codeVerifier,
        state: transaction.state,
        nonce: transaction.nonce,
      });

      const claims = tokenSet.claims();
      if (!claims.sub) {
        throw new UnauthorizedException('The identity provider returned no subject claim.');
      }

      let profile: Record<string, unknown> = { ...claims };

      // Some providers keep profile and email claims out of the ID token; fall
      // back to userinfo rather than showing an assistant a blank account menu.
      if (!profile[this.settings.nameClaim] || !profile[this.settings.emailClaim]) {
        try {
          profile = { ...profile, ...(await client.userinfo(tokenSet)) };
        } catch (error) {
          this.logger.debug(`userinfo lookup skipped: ${describe(error)}`);
        }
      }

      return {
        subject: claims.sub,
        name:
          readString(profile, this.settings.nameClaim) ||
          readString(profile, 'preferred_username') ||
          'Unnamed user',
        email: readString(profile, this.settings.emailClaim),
        role: readString(profile, this.settings.roleClaim) || this.settings.defaultRole,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Authorization code exchange failed: ${describe(error)}`);
      throw new UnauthorizedException('Sign-in could not be completed.');
    }
  }

  /** The IdP's RP-initiated logout URL, when the provider advertises one. */
  async endSessionUrl(): Promise<string | null> {
    const client = await this.discover();

    if (!client.issuer.metadata.end_session_endpoint) {
      return null;
    }

    return client.endSessionUrl(
      this.settings.postLogoutRedirectUri
        ? { post_logout_redirect_uri: this.settings.postLogoutRedirectUri }
        : {},
    );
  }

  private async discover(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const issuer = await Issuer.discover(this.settings.issuerUrl);
    this.client = new issuer.Client({
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
      redirect_uris: [this.settings.redirectUri],
      response_types: ['code'],
    });

    return this.client;
  }
}

/** Reads a claim as a trimmed string, tolerating arrays and absent values. */
function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }
  return typeof value === 'string' ? value.trim() : '';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
