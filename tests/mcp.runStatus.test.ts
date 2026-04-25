import { describe, expect, it } from 'vitest';
import { createRunStatusToolHandler } from '../src/mcp/tools/runStatus.js';
import { createGeminiMusicVariantResponse } from './fixtures/geminiMusicStatusFixture.js';
import { createGrokImagineVideoResponse } from './fixtures/grokImagineStatusFixture.js';

describe('mcp run_status tool', () => {
  it('reads response run status through the shared status envelope', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async (id) => ({
          id,
          object: 'response',
          status: 'completed',
          model: 'gemini-3-pro',
          output: [],
          metadata: {
            runId: id,
            runtimeProfile: 'default',
            service: 'gemini',
            executionSummary: {
              completedAt: '2026-04-23T04:00:00.000Z',
              lastUpdatedAt: '2026-04-23T04:00:00.000Z',
              stepSummaries: [
                {
                  stepId: `${id}:step:1`,
                  order: 1,
                  agentId: 'api-responses',
                  status: 'succeeded',
                  runtimeProfileId: 'default',
                  browserProfileId: null,
                  service: 'gemini',
                },
              ],
              orchestrationTimelineSummary: {
                total: 1,
                items: [
                  {
                    type: 'step-succeeded',
                    createdAt: '2026-04-23T04:00:00.000Z',
                    stepId: `${id}:step:1`,
                    note: 'step completed by local runner',
                  },
                ],
              },
              failureSummary: null,
            },
          },
        }),
      },
      mediaGenerationService: {
        readGeneration: async () => null,
      },
    });

    const result = await handler({ id: 'resp_status_1' });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'resp_status_1',
        object: 'auracall_run_status',
        kind: 'response',
        status: 'completed',
        stepCount: 1,
        artifactCount: 0,
        metadata: {
          runId: 'resp_status_1',
          runtimeProfile: 'default',
          service: 'gemini',
          model: 'gemini-3-pro',
        },
        lastEvent: {
          type: 'step-succeeded',
        },
      },
    });
  });

  it('falls through to media-generation status when no response run exists', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async () => null,
      },
      mediaGenerationService: {
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
              id: 'artifact_run_status_1',
              type: 'image',
              fileName: 'Generated image 1.png',
              path: '/tmp/Generated image 1.png',
              metadata: {
                materialization: 'visible-image-screenshot',
                downloadLabel: 'Download as MP3',
                downloadVariant: 'mp3',
                downloadOptions: ['Download as video with album art', 'Download as MP3'],
              },
            },
          ],
          timeline: [
            {
              event: 'completed',
              at: '2026-04-23T03:45:22.951Z',
            },
          ],
        }),
      },
    });

    const result = await handler({ id: 'medgen_status_1' });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_status_1',
        object: 'auracall_run_status',
        kind: 'media_generation',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'artifact_run_status_1',
            fileName: 'Generated image 1.png',
            path: '/tmp/Generated image 1.png',
            materialization: 'visible-image-screenshot',
            downloadLabel: 'Download as MP3',
            downloadVariant: 'mp3',
            downloadOptions: ['Download as video with album art', 'Download as MP3'],
          },
        ],
        lastEvent: {
          event: 'completed',
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
        object: 'auracall_run_status',
        kind: 'media_generation',
        browserDiagnostics: {
          probeStatus: 'unavailable',
          reason: 'media generation medgen_status_1 is not actively running',
        },
      },
    });
  });

  it('preserves Gemini music variants through generic MCP run status', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async () => null,
      },
      mediaGenerationService: {
        readGeneration: async (id) => createGeminiMusicVariantResponse(id),
      },
    });

    const result = await handler({ id: 'medgen_gemini_music_variants_1' });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Run medgen_gemini_music_variants_1 (media_generation) is succeeded; last event completed; artifacts 2.',
        },
      ],
      structuredContent: {
        id: 'medgen_gemini_music_variants_1',
        object: 'auracall_run_status',
        kind: 'media_generation',
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
        metadata: {
          conversationId: '62dd6ff9d85218b1',
          tabTargetId: 'gemini-tab-1',
          mediaDiagnostics: {
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
      },
    });
  });

  it('preserves Grok Imagine video materialization through generic MCP run status', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async () => null,
      },
      mediaGenerationService: {
        readGeneration: async (id) => createGrokImagineVideoResponse(id),
      },
    });

    const result = await handler({ id: 'medgen_grok_imagine_video_1' });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Run medgen_grok_imagine_video_1 (media_generation) is succeeded; last event completed; artifacts 1.',
        },
      ],
      structuredContent: {
        id: 'medgen_grok_imagine_video_1',
        object: 'auracall_run_status',
        kind: 'media_generation',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'grok_imagine_video_1',
            fileName: 'grok-imagine-video-1.mp4',
            mimeType: 'video/mp4',
            materialization: 'remote-media-fetch',
          },
        ],
        metadata: {
          tabTargetId: 'grok-video-tab-1',
          mediaDiagnostics: {
            capability: {
              id: 'grok.media.imagine_video',
              discoveryAction: 'grok-imagine-video-mode',
            },
            capabilitySelection: {
              capabilityId: 'grok.media.imagine_video',
              mode: 'Video',
              selected: true,
              clicked: true,
              modeControls: [
                {
                  text: 'Image',
                  checked: 'false',
                },
                {
                  text: 'Video',
                  checked: 'true',
                },
              ],
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
      },
    });
  });
});
