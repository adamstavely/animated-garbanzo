import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AnthropicNameGeneratorService } from './anthropic-name-generator.service';

/** Minimal stand-in for the SDK's messages.create. */
const create = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create };
  },
}));

function buildService(): AnthropicNameGeneratorService {
  const configService = {
    get: () => ({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-5',
      maxTokens: 3000,
      timeoutMs: 1000,
      maxRetries: 0,
    }),
  } as unknown as ConfigService;

  return new AnthropicNameGeneratorService(configService as never);
}

function textReply(text: string): unknown {
  return { content: [{ type: 'text', text }] };
}

describe('AnthropicNameGeneratorService', () => {
  const input = { system: 'system instruction', prompt: 'generate please' };

  it('sends the system instruction and prompt to the configured model', async () => {
    create.mockResolvedValue(textReply('{"candidates":[]}'));

    await buildService().generate(input);

    expect(create).toHaveBeenCalledWith({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      system: 'system instruction',
      messages: [{ role: 'user', content: 'generate please' }],
    });
  });

  it('parses a well-formed reply', async () => {
    create.mockResolvedValue(
      textReply(
        '{"candidates":[{"name":"Bridget C. Ashworth","pronunciation":"BRIJ-it","origin":"Anglo-Irish","priorUse":false}]}',
      ),
    );

    await expect(buildService().generate(input)).resolves.toEqual([
      {
        name: 'Bridget C. Ashworth',
        pronunciation: 'BRIJ-it',
        origin: 'Anglo-Irish',
        priorUse: false,
      },
    ]);
  });

  it('recovers the JSON when the model wraps it in prose or a fence', async () => {
    create.mockResolvedValue(
      textReply('Here you go:\n```json\n{"candidates":[{"name":"Bridget C. Ashworth"}]}\n```'),
    );

    const candidates = await buildService().generate(input);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.name).toBe('Bridget C. Ashworth');
  });

  it('joins multiple text blocks before parsing', async () => {
    create.mockResolvedValue({
      content: [
        { type: 'text', text: '{"candidates":[{"name":' },
        { type: 'thinking', thinking: 'ignored' },
        { type: 'text', text: '"Bridget C. Ashworth"}]}' },
      ],
    });

    await expect(buildService().generate(input)).resolves.toHaveLength(1);
  });

  it('rejects unparseable output rather than passing it on', async () => {
    create.mockResolvedValue(textReply('I am afraid I cannot do that.'));

    await expect(buildService().generate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects output whose shape does not match the contract', async () => {
    create.mockResolvedValue(textReply('{"candidates":[{"nom":"Bridget"}]}'));

    await expect(buildService().generate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('translates a transport failure into a service-unavailable error', async () => {
    create.mockRejectedValue(new Error('socket hang up'));

    await expect(buildService().generate(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats a reply with no candidates as an empty list, not a failure', async () => {
    create.mockResolvedValue(textReply('{}'));

    await expect(buildService().generate(input)).resolves.toEqual([]);
  });
});
