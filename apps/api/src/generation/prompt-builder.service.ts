import { Injectable } from '@nestjs/common';

import { nameWords } from './name-rules';

/**
 * System instruction sent with every generation. Guardrails live here as well as
 * in the user prompt, deliberately: the two reinforce each other, and an assistant
 * editing the prompt panel cannot accidentally strip the safety framing from both.
 */
export const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a naming assistant for a publishing house. You never suggest a name that is ' +
  'offensive, obscene, or derogatory in any language, and never a name belonging to or ' +
  'closely resembling a real famous person, published author, brand, or well-known ' +
  'fictional character. Safety and non-infringement outrank creativity. You output JSON only.';

/** How many candidates we ask for, so screening has slack to discard. */
export const REQUESTED_CANDIDATE_COUNT = 20;

/** Upper bound on cleared candidates kept for review. */
export const MAX_KEPT_CANDIDATES = 15;

export interface PromptBrief {
  legalName: string;
  presentation: string;
  origin: string;
  notes: string;
}

export interface PromptOptions {
  /** Free-text steer that applies to this regeneration pass only. */
  refine?: string;
  /** Locked names carried across a regeneration; the model must not repeat them. */
  lockedNames?: readonly string[];
}

@Injectable()
export class PromptBuilderService {
  /**
   * Composes the generation prompt from a brief.
   *
   * The shape block pins the JSON contract, and the hard rules restate the
   * guardrails plus the mechanical constraints screening will enforce anyway.
   */
  build(brief: PromptBrief, options: PromptOptions = {}): string {
    const avoid = nameWords(brief.legalName).join(', ');
    const locked = options.lockedNames ?? [];

    return [
      'You generate pen names for a publishing house. Return ONLY valid JSON, no prose, no code fence.',
      'Shape: {"candidates":[{"name":"First M. Last","pronunciation":"MAR-go SEL-den",' +
        '"origin":"one short clause on linguistic origin and register",' +
        '"priorUse":true|false,"priorUseWho":"who, if any"}]}',
      `Author legal name: ${brief.legalName}`,
      `Pen name should read as: ${brief.presentation}`,
      brief.origin ? `Language / cultural origin to lean on: ${brief.origin}` : '',
      brief.notes ? `Editorial notes: ${brief.notes}` : '',
      options.refine ? `Refinement for this pass: ${options.refine}` : '',
      locked.length
        ? `Names already locked (do NOT repeat, but match their register): ${locked.join(', ')}`
        : '',
      'Hard rules:',
      `- Produce ${REQUESTED_CANDIDATE_COUNT} candidates so some can be discarded.`,
      `- Share NO name part, no starting letter, and no phonetic stem with any part of: ${avoid}.`,
      '- Set priorUse true if the full name, or the given-name + surname pair ignoring the middle ' +
        'initial, belongs to or closely resembles ANY published author, public figure (living or ' +
        'historical), celebrity, politician, brand, or well-known fictional character; name them ' +
        'in priorUseWho. When in doubt, mark it true.',
      '- Do not propose names that are famous, iconic, or instantly recognisable, and do not ' +
        'near-miss a famous name by one letter or a homophone.',
      '- Do not propose names that are offensive, obscene, slurs, or vulgar in any language; ' +
        'nothing scatological, sexual, or derogatory; no names that read as a joke, pun, or ' +
        'innuendo when spoken aloud.',
      '- Avoid names of religious or sacred figures, and names strongly tied to atrocities, ' +
        'extremist movements, or notorious criminals.',
      '- Do not appropriate a cultural or ethnic identity beyond the requested origin; if no ' +
        'origin is given, stay neutral.',
      '- Each name must be plausible, pronounceable, and unremarkable on a book jacket.',
      '- Every name MUST be given name + middle initial with a period + surname, e.g. ' +
        '"Margot A. Selden". Never omit the middle initial.',
      '- The middle initial must not match any initial of the legal name.',
      '- No titles, no other abbreviations.',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }
}
