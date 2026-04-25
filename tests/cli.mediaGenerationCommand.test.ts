import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createMediaGenerationFromCli,
  formatMediaGenerationCli,
} from '../src/cli/mediaGenerationCommand.js';
import type { ResolvedUserConfig } from '../src/config.js';
import type { MediaGenerationResponse } from '../src/media/types.js';

const userConfig = {
  auracallProfile: 'default',
} as ResolvedUserConfig;

describe('media generation CLI helpers', () => {
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
