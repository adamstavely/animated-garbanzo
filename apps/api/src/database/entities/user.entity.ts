import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A publishing assistant, provisioned on first sign-in from the OIDC claims.
 * The identity provider owns the profile; this table only mirrors what the UI
 * needs (avatar initials, display name, role line) and links approvals to a person.
 */
@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The `sub` claim — stable per IdP, and the join key on every sign-in. */
  @Index('idx_users_subject', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Free-text line under the name in the account menu, e.g. "Publishing assistant · Trade". */
  @Column({ type: 'varchar', length: 255 })
  role: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
