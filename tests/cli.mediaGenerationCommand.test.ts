import { Command } from 'commander';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createMediaGenerationFromCli,
  formatMediaGenerationCli,
  registerMediaGenerationCliCommand,
} from '../src/cli/mediaGenerationCommand.js';
import type { ResolvedUserConfig } from '../src/config.js';
import type { MediaGenerationResponse } from '../src/media/types.js';

const userConfig = {
  auracallProfile: 'default',
} as ResolvedUserConfig;

describe('media generation CLI helpers', () => {
  it('parses the Commander command path and invokes the shared service without live provider work', async () => {
    const createGenerationAsync = vi.fn(async () => mediaResponse({ status: 'running' }));
    const resolveUserConfig = vi.fn(async () => userConfig);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
      const program = new Command();
      program.exitOverride();
      program.configureOutput({
        writeOut: (value) => logs.push(value),
        writeErr: (value) => logs.push(value),
      });
      registerMediaGenerationCliCommand(program, {
        resolveUserConfig,
        parseIntOption: (value) => (value == null ? undefined : Number.parseInt(value, 10)),
        service: {
          createGeneration: vi.fn(async () => mediaResponse({ status: 'succeeded' })),
          createGenerationAsync,
        },
      });

      await program.parseAsync([
        'node',
        'auracall',
        'media',
        'generate',
        '--provider',
        'grok',
        '--type',
        'image',
        '--prompt',
        'Generate an image of an asphalt secret agent',
        '--count',
        '1',
        '--aspect-ratio',
        '1:1',
        '--no-wait',
        '--json',
      ]);
    } finally {
      console.log = originalLog;
    }

    expect(resolveUserConfig).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'grok',
      type: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      count: 1,
      aspectRatio: '1:1',
      wait: false,
      json: true,
    }));
    expect(createGenerationAsync).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      count: 1,
      aspectRatio: '1:1',
      source: 'cli',
    }));
    expect(JSON.parse(logs.join('\n'))).toMatchObject({
      id: 'medgen_cli_media_1',
      status: 'running',
      object: 'media_generation',
    });
  });

  it('accepts media prompts when the full CLI also owns --prompt', async () => {
    const createGenerationAsync = vi.fn(async () => mediaResponse({ status: 'running' }));
    const resolveUserConfig = vi.fn(async () => userConfig);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
      const program = new Command();
      program
        .exitOverride()
        .option('-p, --prompt <text>', 'Root prompt option used by normal text runs.')
        .option('--profile <name>', 'Select which AuraCall runtime profile to use for this run.');
      program.configureOutput({
        writeOut: (value) => logs.push(value),
        writeErr: (value) => logs.push(value),
      });
      registerMediaGenerationCliCommand(program, {
        resolveUserConfig,
        parseIntOption: (value) => (value == null ? undefined : Number.parseInt(value, 10)),
        service: {
          createGeneration: vi.fn(async () => mediaResponse({ status: 'succeeded' })),
          createGenerationAsync,
        },
      });

      await program.parseAsync([
        'node',
        'auracall',
        '--profile',
        'auracall-grok-auto',
        'media',
        'generate',
        '--provider',
        'grok',
        '--type',
        'image',
        '--prompt',
        'Generate images of an asphalt secret agent',
        '--transport',
        'browser',
        '--no-wait',
        '--json',
      ]);
    } finally {
      console.log = originalLog;
    }

    expect(resolveUserConfig).toHaveBeenCalledWith(expect.objectContaining({
      profile: 'auracall-grok-auto',
      prompt: 'Generate images of an asphalt secret agent',
    }));
    expect(createGenerationAsync).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate images of an asphalt secret agent',
      transport: 'browser',
      source: 'cli',
    }));
  });

  it('creates a browser media-generation request through the shared contract', async () => {
    const createGeneration = vi.fn(async () => mediaResponse({ status: 'succeeded' }));

    await createMediaGenerationFromCli(
      {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        count: 2,
        aspectRatio: '1:1',
        wait: true,
      },
      userConfig,
      {
        service: {
          createGeneration,
        },
      },
    );

    expect(createGeneration).toHaveBeenCalledWith({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      model: null,
      transport: 'browser',
      count: 2,
      size: null,
      aspectRatio: '1:1',
      source: 'cli',
    });
  });

  it('uses async creation when --no-wait is requested', async () => {
    const createGeneration = vi.fn(async () => mediaResponse({ status: 'succeeded' }));
    const createGenerationAsync = vi.fn(async () => mediaResponse({ status: 'running' }));

    const response = await createMediaGenerationFromCli(
      {
        provider: 'grok',
        mediaType: 'video',
        prompt: 'Generate a short spy video',
        transport: 'browser',
        wait: false,
      },
      userConfig,
      {
        service: {
          createGeneration,
          createGenerationAsync,
        },
      },
    );

    expect(createGeneration).not.toHaveBeenCalled();
    expect(createGenerationAsync).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'grok',
      mediaType: 'video',
      source: 'cli',
    }));
    expect(formatMediaGenerationCli(response)).toContain('Poll: auracall run status medgen_cli_media_1');
  });

  it('formats cached artifacts and failures for terminal readback', () => {
    const formatted = formatMediaGenerationCli(mediaResponse({ status: 'failed' }));

    expect(formatted).toContain('Media generation medgen_cli_media_1 is failed');
    expect(formatted).toContain('Artifacts: 1');
    expect(formatted).toContain('image: asphalt-secret-agent.png');
    expect(formatted).toContain('Failure: media_generation_provider_timeout');
  });
});

function mediaResponse({ status }: { status: MediaGenerationResponse['status'] }): MediaGenerationResponse {
  const now = '2026-04-25T20:00:00.000Z';
  return {
    id: 'medgen_cli_media_1',
    object: 'media_generation',
    status,
    provider: 'gemini',
    mediaType: 'image',
    model: null,
    prompt: 'Generate an image of an asphalt secret agent',
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'running' ? null : now,
    artifacts: [
      {
        id: 'artifact_cli_media_1',
        type: 'image',
        fileName: 'asphalt-secret-agent.png',
        path: path.join('/tmp', 'asphalt-secret-agent.png'),
        mimeType: 'image/png',
        metadata: {
          materialization: 'visible-image-screenshot',
        },
      },
    ],
    timeline: [
      {
        event: status === 'running' ? 'running_persisted' : status === 'failed' ? 'failed' : 'completed',
        at: now,
        details: null,
      },
    ],
    failure: status === 'failed'
      ? {
          code: 'media_generation_provider_timeout',
          message: 'Provider did not expose generated media.',
        }
      : null,
  };
}
