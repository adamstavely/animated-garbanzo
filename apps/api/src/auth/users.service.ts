import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../config/configuration';
import { UserEntity } from '../database/entities';
import { AuthenticatedUser } from './authenticated-user';
import { OidcProfile } from './oidc.service';
import { canAdministerRole } from './privileges';

/**
 * Mirrors IdP identities locally.
 *
 * The identity provider stays the source of truth; this table exists so approvals
 * can reference a stable row and so the UI has a display name without calling the
 * IdP on every request.
 */
@Injectable()
export class UsersService {
  private readonly adminRoles: string[];
  private readonly isProduction: boolean;

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.adminRoles = configService.get('oidc', { infer: true }).adminRoles;
    this.isProduction = configService.get('isProduction', { infer: true });
  }

  /** Creates the user on first sign-in, refreshing the profile on every later one. */
  async upsertFromProfile(profile: OidcProfile): Promise<AuthenticatedUser> {
    const existing = await this.users.findOne({ where: { subject: profile.subject } });

    const user = existing ?? this.users.create({ subject: profile.subject });
    user.name = profile.name;
    user.email = profile.email;
    user.role = profile.role;
    user.lastLoginAt = new Date();

    const saved = await this.users.save(user);

    return this.toAuthenticatedUser(saved);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  toAuthenticatedUser(user: UserEntity): AuthenticatedUser {
    return {
      id: user.id,
      subject: user.subject,
      name: user.name,
      email: user.email,
      role: user.role,
      canAdminister: canAdministerRole(user.role, this.adminRoles, this.isProduction),
    };
  }
}
