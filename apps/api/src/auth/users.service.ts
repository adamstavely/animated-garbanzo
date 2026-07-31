import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../database/entities';
import { AuthenticatedUser } from './authenticated-user';
import { OidcProfile } from './oidc.service';

/**
 * Mirrors IdP identities locally.
 *
 * The identity provider stays the source of truth; this table exists so approvals
 * can reference a stable row and so the UI has a display name without calling the
 * IdP on every request.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /** Creates the user on first sign-in, refreshing the profile on every later one. */
  async upsertFromProfile(profile: OidcProfile): Promise<AuthenticatedUser> {
    const existing = await this.users.findOne({ where: { subject: profile.subject } });

    const user = existing ?? this.users.create({ subject: profile.subject });
    user.name = profile.name;
    user.email = profile.email;
    user.role = profile.role;
    user.lastLoginAt = new Date();

    const saved = await this.users.save(user);

    return {
      id: saved.id,
      subject: saved.subject,
      name: saved.name,
      email: saved.email,
      role: saved.role,
    };
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }
}
