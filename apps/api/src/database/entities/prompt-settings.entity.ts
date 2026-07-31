import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Editable model instructions, exposed through the in-app prompt panel.
 *
 * A single row keyed by {@link PROMPT_SETTINGS_ID}. `promptOverride` is null while
 * the prompt is auto-composed from each brief; saving an edited prompt stores it
 * here and it is then sent verbatim.
 */
@Entity({ name: 'prompt_settings' })
export class PromptSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  /** Null means "use the built-in default system instruction". */
  @Column({ type: 'text', nullable: true })
  systemOverride: string | null;

  /** Null means "compose the prompt from the brief". */
  @Column({ type: 'text', nullable: true })
  promptOverride: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export const PROMPT_SETTINGS_ID = 'default';
