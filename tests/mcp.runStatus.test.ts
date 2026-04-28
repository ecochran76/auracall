import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createRunStatusToolHandler } from '../src/mcp/tools/runStatus.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import {
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';
import { createGeminiMusicVariantResponse } from './fixtures/geminiMusicStatusFixture.js';
import { createGrokImagineVideoResponse } from './fixtures/grokImagineStatusFixture.js';

describe('mcp run_status tool', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

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
              browserRunSummary: {
                chatgptDeepResearchStage: 'plan-edit-opened',
                chatgptDeepResearchReviewEvidence: {
                  screenshotPath: '/tmp/deep-research-review.png',
                },
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
          browserRunSummary: {
            chatgptDeepResearchStage: 'plan-edit-opened',
            chatgptDeepResearchReviewEvidence: {
              screenshotPath: '/tmp/deep-research-review.png',
            },
          },
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

  it('preserves browser operation queue diagnostics through generic MCP response run status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-run-status-browser-queue-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const control = createExecutionRuntimeControl();
    const runId = 'resp_mcp_browser_queue_1';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-25T18:40:00.000Z';
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe queued browser diagnostics.',
          initialInputs: {
            model: 'gpt-5.2',
            runtimeProfile: 'auracall-gemini-pro',
            service: 'gemini',
          },
          sharedStateId: `${runId}:state`,
          stepIds: [stepId],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: stepId,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'auracall-gemini-pro',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe queued browser diagnostics.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: createdAt,
        }),
        events: [],
      }),
    );
    const latestQueueEvent = {
      event: 'queued' as const,
      at: '2026-04-25T18:40:04.000Z',
      key: `managed-profile:${homeDir}/browser-profiles/auracall-gemini-pro/gemini::service:gemini`,
      operation: null,
      blockedBy: {
        id: 'operation-mcp-blocker',
        kind: 'browser-execution' as const,
        operationClass: 'exclusive-mutating' as const,
        ownerPid: 34567,
        ownerCommand: 'browser-execution',
        startedAt: '2026-04-25T18:39:30.000Z',
        updatedAt: '2026-04-25T18:39:30.000Z',
      },
      attempt: 1,
      elapsedMs: 0,
    };

    const handler = createRunStatusToolHandler({
      responsesService: createExecutionResponsesService({ control }),
      mediaGenerationService: {
        readGeneration: async () => null,
      },
      probeRuntimeRunBrowserDiagnostics: async ({ step }) => ({
        service: step.service,
        ownerStepId: step.id,
        observedAt: '2026-04-25T18:40:05.000Z',
        source: 'browser-service',
        target: {
          host: '127.0.0.1',
          port: 9222,
          targetId: 'gemini-tab-queue-mcp',
          url: 'https://gemini.google.com/app',
          title: 'Google Gemini',
        },
        document: {
          url: 'https://gemini.google.com/app',
          title: 'Google Gemini',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          bodyTextLength: 700,
        },
        visibleCounts: {
          buttons: 10,
          links: 2,
          inputs: 0,
          textareas: 0,
          contenteditables: 1,
          modelResponses: 1,
        },
        providerEvidence: {
          hasActiveAvatarSpinner: true,
          isGenerating: true,
        },
        browserOperationQueue: {
          total: 1,
          latest: latestQueueEvent,
          items: [latestQueueEvent],
        },
      }),
    });

    const result = await handler({
      id: runId,
      diagnostics: 'browser-state',
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: runId,
        object: 'auracall_run_status',
        kind: 'response',
        browserDiagnostics: {
          probeStatus: 'observed',
          service: 'gemini',
          ownerStepId: stepId,
          browserOperationQueue: {
            total: 1,
            latest: {
              event: 'queued',
              blockedBy: {
                kind: 'browser-execution',
                operationClass: 'exclusive-mutating',
                ownerPid: 34567,
              },
            },
          },
        },
      },
    });
  });
});
