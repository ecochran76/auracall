import { describe, expect, it } from 'vitest';
import { createMediaGenerationToolHandler } from '../src/mcp/tools/mediaGeneration.js';

describe('mcp media_generation tool', () => {
  it('routes requests through the shared media generation service contract', async () => {
    const handler = createMediaGenerationToolHandler({
      createGeneration: async (request) => ({
        id: 'medgen_mcp_1',
        object: 'media_generation',
        status: 'succeeded',
        provider: request.provider,
        mediaType: request.mediaType,
        model: 'fake-grok-image',
        prompt: request.prompt,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:00:01.000Z',
        completedAt: '2026-04-22T12:00:01.000Z',
        artifacts: [
          {
            id: 'artifact_mcp_1',
            type: 'image',
            mimeType: 'image/png',
            uri: 'file:///tmp/fake.png',
          },
        ],
        metadata: {
          source: request.source,
        },
      }),
      readGeneration: async () => null,
    });

    const result = await handler({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      transport: 'api',
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_mcp_1',
        object: 'media_generation',
        status: 'succeeded',
        provider: 'grok',
        mediaType: 'image',
        model: 'fake-grok-image',
        metadata: {
          source: 'mcp',
        },
      },
    });
  });

  it('accepts music as a media generation type', async () => {
    const handler = createMediaGenerationToolHandler({
      createGeneration: async (request) => ({
        id: 'medgen_mcp_music_1',
        object: 'media_generation',
        status: 'succeeded',
        provider: request.provider,
        mediaType: request.mediaType,
        prompt: request.prompt,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:00:01.000Z',
        completedAt: '2026-04-22T12:00:01.000Z',
        artifacts: [
          {
            id: 'artifact_mcp_music_1',
            type: 'music',
            mimeType: 'video/mp4',
            uri: 'file:///tmp/fake-track.mp4',
          },
        ],
      }),
      readGeneration: async () => null,
    });

    const result = await handler({
      provider: 'gemini',
      mediaType: 'music',
      prompt: 'Create a short spy theme for an asphalt secret agent',
      transport: 'browser',
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_mcp_music_1',
        status: 'succeeded',
        provider: 'gemini',
        mediaType: 'music',
        artifacts: [
          {
            id: 'artifact_mcp_music_1',
            type: 'music',
            mimeType: 'video/mp4',
          },
        ],
      },
    });
  });
});
