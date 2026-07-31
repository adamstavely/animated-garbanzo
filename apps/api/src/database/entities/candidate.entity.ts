import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { PenNameRequestEntity } from './pen-name-request.entity';

/**
 * A pen name that survived screening and is offered to the assistant.
 * Candidates that failed screening are never stored — only counted, which is
 * what the "N discarded in screening" line reports.
 */
@Entity({ name: 'candidates' })
export class CandidateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_candidates_request')
  @Column({ type: 'uuid' })
  requestId: string;

  @ManyToOne(() => PenNameRequestEntity, (request) => request.candidates, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'requestId' })
  request: PenNameRequestEntity;

  /** Display form with the surname upper-cased, e.g. "Bridget C. ASHWORTH". */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  pronunciation: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  origin: string;

  /** Locked candidates are carried over when the assistant regenerates. */
  @Column({ type: 'boolean', default: false })
  locked: boolean;

  /** Preserves the order the model returned them in; locked names sort first. */
  @Column({ type: 'integer', default: 0 })
  position: number;
}
