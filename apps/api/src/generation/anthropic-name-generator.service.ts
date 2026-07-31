import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { AppConfig } from '../config/configuration';
import { NameGenerationInput, NameGenerator } from './name-generator.interface';
import { RawCandidate } from './name-rules';

/**
 * The model is instructed to return JSON only, but a language model is not a
 * schema. Everything it sends is parsed defensively and validated before it is
 * allowed anywhere near the screening stage.
 */
const candidateSchema = z.object({
  name: z.string(),
  pronunciation: z.string().optional().default(''),
  origin: z.string().optional().default(''),
  priorUse: z.boolean().optional(),
  priorUseWho: z.string().optional(),
});

const responseSchema = z.object({
  candidates: z.array(candidateSchema).default([]),
});

@Injectable()
export class AnthropicNameGeneratorService implements NameGenerator {
  private readonly logger = new Logger(AnthropicNameGeneratorService.name);
  private readonly client: Anthropic;
  private readonly config: AppConfig['anthropic'];

  constructor(configService: ConfigService<AppConfig, true>) {
    this.config = configService.get('anthropic', { infer: true });
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  async generate({ system, prompt }: NameGenerationInput): Promise<RawCandidate[]> {
    let text: string;

    try {
      const message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      });

      text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
    } catch (error) {
      this.logger.error(
        `Anthropic request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('The naming model is unavailable. Try again.');
    }

    return this.parse(text);
  }

  /**
   * Extracts the JSON object from the reply. The prompt forbids prose and code
   * fences, but we still slice from the first `{` to the last `}` so a stray
   * preamble does not fail an otherwise good response.
   */
  private parse(text: string): RawCandidate[] {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const payload = start !== -1 && end > start ? text.slice(start, end + 1) : text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      this.logger.warn(`Model returned unparseable JSON (${text.length} chars)`);
      throw new ServiceUnavailableException('The naming model returned an unreadable response.');
    }

    const result = responseSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(`Model response failed validation: ${result.error.message}`);
      throw new ServiceUnavailableException('The naming model returned an unexpected shape.');
    }

    return result.data.candidates;
  }
}
