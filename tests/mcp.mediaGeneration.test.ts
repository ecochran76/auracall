import { describe, expect, it } from 'vitest';
import {
  createMediaGenerationStatusToolHandler,
  createMediaGenerationToolHandler,
} from '../src/mcp/tools/mediaGeneration.js';

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

  it('can return an asynchronous media generation id for status polling', async () => {
    let asyncInvoked = false;
    const handler = createMediaGenerationToolHandler({
      createGeneration: async () => {
        throw new Error('sync path should not run');
      },
      createGenerationAsync: async (request) => {
        asyncInvoked = true;
        return {
          id: 'medgen_mcp_async_1',
          object: 'media_generation',
          status: 'running',
          provider: request.provider,
          mediaType: request.mediaType,
          prompt: request.prompt,
          createdAt: '2026-04-22T12:00:00.000Z',
          updatedAt: '2026-04-22T12:00:00.000Z',
          completedAt: null,
          artifacts: [],
          timeline: [
            {
              event: 'running_persisted',
              at: '2026-04-22T12:00:00.000Z',
              details: {
                status: 'running',
              },
            },
          ],
          metadata: {
            source: request.source,
          },
        };
      },
      readGeneration: async () => null,
    });

    const result = await handler({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      transport: 'browser',
      wait: false,
    });

    expect(asyncInvoked).toBe(true);
    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_mcp_async_1',
        object: 'media_generation',
        status: 'running',
        provider: 'gemini',
        mediaType: 'image',
        metadata: {
          source: 'mcp',
        },
      },
    });
  });

  it('reads media generation status through the MCP status tool', async () => {
    const handler = createMediaGenerationStatusToolHandler({
      createGeneration: async () => {
        throw new Error('not used');
      },
      readGeneration: async (id) => ({
        id,
        object: 'media_generation',
        status: 'succeeded',
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        createdAt: '2026-04-23T03:44:32.561Z',
        updatedAt: '2026-04-23T03:45:22.951Z',
        completedAt: '2026-04-23T03:45:22.951Z',
        artifacts: [
          {
            id: 'artifact_status_1',
            type: 'image',
            mimeType: 'image/png',
            fileName: 'Generated image 1.png',
            path: '/tmp/Generated image 1.png',
            metadata: {
              materialization: 'visible-image-screenshot',
              remoteUrl: 'blob:https://gemini.google.com/status',
              downloadOptions: ['Download as video with album art', 'Download as MP3'],
            },
          },
        ],
        timeline: [
          {
            event: 'running_persisted',
            at: '2026-04-23T03:44:32.561Z',
          },
          {
            event: 'submit_path_observed',
            at: '2026-04-23T03:45:12.951Z',
            details: {
              outcome: 'generated_media',
              label: 'submit',
            },
          },
          {
            event: 'completed',
            at: '2026-04-23T03:45:22.951Z',
            details: {
              status: 'succeeded',
              artifactCount: 1,
            },
          },
        ],
      }),
    });

    const result = await handler({ id: 'medgen_status_1' });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_status_1',
        object: 'media_generation_status',
        status: 'succeeded',
        artifactCount: 1,
        lastEvent: {
          event: 'completed',
        },
        timeline: [
          {
            event: 'running_persisted',
          },
          {
            event: 'submit_path_observed',
            details: {
              outcome: 'generated_media',
            },
          },
          {
            event: 'completed',
          },
        ],
        artifacts: [
          {
            id: 'artifact_status_1',
            fileName: 'Generated image 1.png',
            path: '/tmp/Generated image 1.png',
            materialization: 'visible-image-screenshot',
            remoteUrl: 'blob:https://gemini.google.com/status',
            downloadOptions: ['Download as video with album art', 'Download as MP3'],
          },
        ],
        diagnostics: {
          provider: {
            latestHref: null,
            routeProgression: [],
          },
          materialization: {
            materialization: null,
          },
        },
      },
    });

    const diagnosticResult = await handler({
      id: 'medgen_status_1',
      diagnostics: 'browser-state',
    });

    expect(diagnosticResult).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_status_1',
        object: 'media_generation_status',
        browserDiagnostics: {
          probeStatus: 'unavailable',
          reason: 'media generation medgen_status_1 is not actively running',
        },
      },
    });
  });
});
