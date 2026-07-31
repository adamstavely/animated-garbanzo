import { RawCandidate } from './name-rules';

/** Injection token for the model-backed name generator. */
export const NAME_GENERATOR = Symbol('NAME_GENERATOR');

export interface NameGenerationInput {
  system: string;
  prompt: string;
}

/**
 * The single seam between Nym and the language model.
 *
 * Keeping it behind an interface means the orchestration and screening can be
 * unit-tested without a network call, and a different provider could be dropped
 * in without touching the request lifecycle.
 */
export interface NameGenerator {
  generate(input: NameGenerationInput): Promise<RawCandidate[]>;
}
