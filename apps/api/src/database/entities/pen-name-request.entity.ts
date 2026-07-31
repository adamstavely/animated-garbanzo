import { Presentation, RequestStatus } from '@nym/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CandidateEntity } from './candidate.entity';
import { UserEntity } from './user.entity';

/** One author's pen name request: the brief, its candidates, and its sign-off. */
@Entity({ name: 'pen_name_requests' })
@Index('idx_requests_status_created', ['status', 'createdAt'])
export class PenNameRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The author's legal name, including middle initial, e.g. "Margaret E. Voss". */
  @Column({ type: 'varchar', length: 255 })
  legalName: string;

  @Column({ type: 'varchar', length: 16 })
  presentation: Presentation;

  /** Language / cultural origin to lean on; empty means no preference. */
  @Column({ type: 'varchar', length: 120, default: '' })
  origin: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  /** Steer applied to the next regeneration; cleared once consumed. */
  @Column({ type: 'text', default: '' })
  refine: string;

  @Column({ type: 'varchar', length: 16, default: RequestStatus.Queued })
  status: RequestStatus;

  @OneToMany(() => CandidateEntity, (candidate) => candidate.request, {
    cascade: ['insert', 'update', 'remove'],
  })
  candidates: CandidateEntity[];

  /** Candidate the assistant selected but has not signed off yet. */
  @Column({ type: 'varchar', length: 255, default: '' })
  chosenName: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  approvedName: string;

  /**
   * Snapshot of the approver's display name. Denormalised on purpose: History is
   * an audit surface, so it must keep reading correctly even if the user record
   * is later renamed or deprovisioned.
   */
  @Column({ type: 'varchar', length: 255, default: '' })
  approvedByName: string;

  @Column({ type: 'uuid', nullable: true })
  approvedById: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /** Running total of candidates screening rejected across all runs. */
  @Column({ type: 'integer', default: 0 })
  discardedCount: number;

  /** Failure reason shown inline on the row; empty when the last run succeeded. */
  @Column({ type: 'text', default: '' })
  errorMessage: string;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity | null;

  /** Rendered as the "Requested" column. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
