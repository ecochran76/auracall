import { describe, expect, it } from 'vitest';
import {
  createMediaGenerationStatusToolHandler,
  createMediaGenerationToolHandler,
} from '../src/mcp/tools/mediaGeneration.js';
import { createGeminiMusicVariantResponse } from './fixtures/geminiMusicStatusFixture.js';
import { createGrokImagineVideoResponse } from './fixtures/grokImagineStatusFixture.js';

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
              checksumSha256: 'preview-sha',
              previewArtifactId: 'preview-artifact',
              previewSize: 123,
              previewChecksumSha256: 'source-sha',
              fullQualityDiffersFromPreview: true,
              downloadLabel: 'Download as MP3',
              downloadVariant: 'mp3',
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
            checksumSha256: 'preview-sha',
            previewArtifactId: 'preview-artifact',
            previewSize: 123,
            previewChecksumSha256: 'source-sha',
            fullQualityDiffersFromPreview: true,
            downloadLabel: 'Download as MP3',
            downloadVariant: 'mp3',
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

  it('preserves Gemini music variants through the MCP status tool', async () => {
    const handler = createMediaGenerationStatusToolHandler({
      createGeneration: async () => {
        throw new Error('not used');
      },
      readGeneration: async (id) => createGeminiMusicVariantResponse(id),
    });

    const result = await handler({ id: 'medgen_gemini_music_variants_1' });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Media generation medgen_gemini_music_variants_1 is succeeded; last event completed; artifacts 2.',
        },
      ],
      structuredContent: {
        id: 'medgen_gemini_music_variants_1',
        object: 'media_generation_status',
        status: 'succeeded',
        artifactCount: 2,
        artifacts: [
          {
            fileName: 'Midnight_at_the_Harbor.mp4',
            mimeType: 'video/mp4',
            materialization: 'generated-media-download-variant',
            downloadLabel: 'VideoAudio with cover art',
            downloadVariant: 'video_with_album_art',
            downloadOptions: ['Download track'],
          },
          {
            fileName: 'Midnight_at_the_Harbor.mp3',
            mimeType: 'audio/mpeg',
            materialization: 'generated-media-download-variant',
            downloadLabel: 'Audio onlyMP3 track',
            downloadVariant: 'mp3',
            downloadOptions: ['Download track'],
          },
        ],
        diagnostics: {
          runState: {
            runState: 'terminal_music',
            terminalMusic: true,
            generatedMusicCount: 1,
          },
          materialization: {
            artifactId: 'gemini-artifact:62dd6ff9d85218b1:1:1:mp3',
            materialization: 'generated-media-download-variant',
          },
        },
      },
    });
  });

  it('preserves Grok Imagine video materialization through the MCP status tool', async () => {
    const handler = createMediaGenerationStatusToolHandler({
      createGeneration: async () => {
        throw new Error('not used');
      },
      readGeneration: async (id) => createGrokImagineVideoResponse(id),
    });

    const result = await handler({ id: 'medgen_grok_imagine_video_1' });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Media generation medgen_grok_imagine_video_1 is succeeded; last event completed; artifacts 1.',
        },
      ],
      structuredContent: {
        id: 'medgen_grok_imagine_video_1',
        object: 'media_generation_status',
        status: 'succeeded',
        provider: 'grok',
        mediaType: 'video',
        artifactCount: 1,
        artifacts: [
          {
            id: 'grok_imagine_video_1',
            fileName: 'grok-imagine-video-1.mp4',
            mimeType: 'video/mp4',
            materialization: 'remote-media-fetch',
            remoteUrl: 'https://assets.grok.com/users/test/generated/video-1.mp4',
          },
        ],
        diagnostics: {
          capability: {
            id: 'grok.media.imagine_video',
            discoveryAction: 'grok-imagine-video-mode',
          },
          runState: {
            runState: 'terminal_video',
            terminalVideo: true,
            generatedVideoCount: 1,
            materializationCandidateSource: 'generated-video',
          },
          materialization: {
            artifactId: 'grok_imagine_video_1',
            materialization: 'remote-media-fetch',
            materializationSource: 'generated-video',
          },
        },
      },
    });
  });
});
