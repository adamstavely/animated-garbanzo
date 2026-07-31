import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One stamp in a shared sliding-window rate-limit bucket.
 *
 * Stored in Postgres so horizontally scaled API instances share the same
 * create / generate / approve-all budgets.
 */
@Entity({ name: 'rate_limit_hits' })
@Index('idx_rate_limit_hits_key_stamped', ['bucketKey', 'stampedAt'])
export class RateLimitHitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  bucketKey: string;

  @Column({ type: 'timestamptz' })
  stampedAt: Date;
}
