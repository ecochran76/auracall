import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createMediaGenerationService, MediaGenerationExecutionError } from '../src/media/service.js';
import { createMediaGenerationRecordStore } from '../src/media/store.js';
import type { WorkbenchCapabilityReporter } from '../src/workbench/types.js';

describe('media generation service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('persists generated artifact metadata through an injected executor', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let nowIndex = 0;
    const nowValues = [
      '2026-04-22T12:00:00.000Z',
      '2026-04-22T12:00:01.000Z',
      '2026-04-22T12:00:02.000Z',
      '2026-04-22T12:00:03.000Z',
      '2026-04-22T12:00:04.000Z',
      '2026-04-22T12:00:05.000Z',
      '2026-04-22T12:00:06.000Z',
    ];
    const service = createMediaGenerationService({
      now: () => new Date(nowValues[Math.min(nowIndex++, nowValues.length - 1)]),
      generateId: () => 'medgen_test_1',
      executor: async ({ artifactDir, emitTimeline }) => {
        await emitTimeline?.({
          event: 'prompt_submitted',
          details: {
            conversationId: 'conversation_1',
          },
        });
        await emitTimeline?.({
          event: 'artifact_poll',
          details: {
            pollCount: 1,
            imageArtifactCount: 1,
          },
        });
        const filePath = path.join(artifactDir, 'fake.png');
        await fs.writeFile(filePath, Buffer.from('fake image bytes'));
        await emitTimeline?.({
          event: 'image_visible',
          details: {
            pollCount: 1,
            generatedArtifactCount: 1,
          },
        });
        await emitTimeline?.({
          event: 'artifact_materialized',
          details: {
            providerArtifactId: 'artifact_1',
            path: filePath,
            materialization: 'test-fixture',
          },
        });
        return {
          model: 'fake-image-model',
          artifacts: [
            {
              id: 'artifact_1',
              type: 'image',
              mimeType: 'image/png',
              fileName: 'fake.png',
              path: filePath,
              uri: `file://${filePath}`,
              width: 1,
              height: 1,
            },
          ],
          metadata: {
            executor: 'fake',
          },
        };
      },
    });

    const created = await service.createGeneration({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      source: 'api',
      count: 1,
      aspectRatio: '1:1',
    });

    expect(created).toMatchObject({
      id: 'medgen_test_1',
      object: 'media_generation',
      status: 'succeeded',
      provider: 'gemini',
      mediaType: 'image',
      model: 'fake-image-model',
      artifacts: [
        {
          id: 'artifact_1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'fake.png',
          width: 1,
          height: 1,
        },
      ],
      metadata: {
        source: 'api',
        count: 1,
        aspectRatio: '1:1',
        executor: 'fake',
      },
      timeline: [
        {
          event: 'running_persisted',
          at: '2026-04-22T12:00:00.000Z',
          details: {
            status: 'running',
          },
        },
        {
          event: 'executor_started',
          at: '2026-04-22T12:00:01.000Z',
        },
        {
          event: 'prompt_submitted',
          at: '2026-04-22T12:00:02.000Z',
        },
        {
          event: 'artifact_poll',
          at: '2026-04-22T12:00:03.000Z',
        },
        {
          event: 'image_visible',
          at: '2026-04-22T12:00:04.000Z',
        },
        {
          event: 'artifact_materialized',
          at: '2026-04-22T12:00:05.000Z',
        },
        {
          event: 'completed',
          at: '2026-04-22T12:00:06.000Z',
          details: {
            status: 'succeeded',
            artifactCount: 1,
          },
        },
      ],
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'executor_started',
      'prompt_submitted',
      'artifact_poll',
      'image_visible',
      'artifact_materialized',
      'completed',
    ]);
    await expect(fs.access(created.artifacts[0]?.path ?? '')).resolves.toBeUndefined();

    const readBack = await service.readGeneration('medgen_test_1');
    expect(readBack).toEqual(created);
  });

  it('accepts ChatGPT browser image requests through the shared schema', async () => {
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-27T12:00:00.000Z'),
      generateId: () => 'medgen_chatgpt_schema_1',
      executor: async ({ request }) => ({
        artifacts: [
          {
            id: 'chatgpt_image_1',
            type: 'image',
            mimeType: 'image/png',
          },
        ],
        metadata: {
          executor: 'chatgpt-browser-test',
          requestProvider: request.provider,
        },
      }),
    });

    const created = await service.createGeneration({
      provider: 'chatgpt',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      transport: 'browser',
      source: 'api',
    });

    expect(created).toMatchObject({
      id: 'medgen_chatgpt_schema_1',
      status: 'succeeded',
      provider: 'chatgpt',
      mediaType: 'image',
      artifacts: [{ id: 'chatgpt_image_1', type: 'image' }],
      metadata: {
        executor: 'chatgpt-browser-test',
        requestProvider: 'chatgpt',
      },
    });
  });

  it('uses collision-safe temp files for burst media record writes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-burst-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const store = createMediaGenerationRecordStore();
    const baseResponse = {
      id: 'medgen_burst_1',
      object: 'media_generation' as const,
      status: 'running' as const,
      provider: 'chatgpt' as const,
      mediaType: 'image' as const,
      prompt: 'Generate an image of an asphalt secret agent',
      createdAt: '2026-04-27T12:00:00.000Z',
      updatedAt: '2026-04-27T12:00:00.000Z',
      completedAt: null,
      artifacts: [],
      timeline: [],
      metadata: {},
    };
    await store.ensureStorage();

    await expect(Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.writeResponse({
          ...baseResponse,
          updatedAt: `2026-04-27T12:00:00.${String(index).padStart(3, '0')}Z`,
          timeline: [
            {
              event: 'artifact_poll',
              at: `2026-04-27T12:00:00.${String(index).padStart(3, '0')}Z`,
              details: { index },
            },
          ],
        }),
      ),
    )).resolves.toHaveLength(20);

    const readBack = await store.readRecord('medgen_burst_1');
    expect(readBack?.response.id).toBe('medgen_burst_1');
  });

  it('records provider execution failures without throwing away the request', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-failure-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-22T12:00:00.000Z'),
      generateId: () => 'medgen_failure_1',
    });

    const created = await service.createGeneration({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      source: 'mcp',
    });

    expect(created).toMatchObject({
      id: 'medgen_failure_1',
      status: 'failed',
      provider: 'grok',
      mediaType: 'image',
      failure: {
        code: 'media_provider_not_implemented',
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'executor_started',
      'failed',
    ]);
    await expect(service.readGeneration('medgen_failure_1')).resolves.toEqual(created);
  });

  it('resumes materialization for an existing generation without changing terminal status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-resume-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let nowIndex = 0;
    const nowValues = [
      '2026-04-25T12:00:00.000Z',
      '2026-04-25T12:00:01.000Z',
      '2026-04-25T12:00:02.000Z',
      '2026-04-25T12:00:03.000Z',
      '2026-04-25T12:00:04.000Z',
      '2026-04-25T12:00:05.000Z',
      '2026-04-25T12:00:06.000Z',
    ];
    const service = createMediaGenerationService({
      now: () => new Date(nowValues[Math.min(nowIndex++, nowValues.length - 1)]),
      generateId: () => 'medgen_resume_1',
      executor: async ({ artifactDir }) => {
        const filePath = path.join(artifactDir, 'preview.png');
        await fs.writeFile(filePath, Buffer.from('preview'));
        return {
          artifacts: [
            {
              id: 'preview_1',
              type: 'image',
              fileName: 'preview.png',
              path: filePath,
              mimeType: 'image/png',
              metadata: {
                materialization: 'visible-tile-browser-capture',
              },
            },
          ],
          metadata: {
            executor: 'fixture',
          },
        };
      },
      materializer: async ({ artifactDir, options, emitTimeline }) => {
        await emitTimeline?.({
          event: 'artifact_poll',
          details: {
            materializationSource: 'grok-browser-service-resume',
            requestedVisibleTileCount: options?.count ?? null,
          },
        });
        const filePath = path.join(artifactDir, 'full-quality.png');
        await fs.writeFile(filePath, Buffer.from('full quality'));
        await emitTimeline?.({
          event: 'artifact_materialized',
          details: {
            providerArtifactId: 'full_quality_1',
            path: filePath,
            materialization: 'download-button',
            resumed: true,
          },
        });
        return {
          artifacts: [
            {
              id: 'full_quality_1',
              type: 'image',
              fileName: 'full-quality.png',
              path: filePath,
              mimeType: 'image/png',
              metadata: {
                materialization: 'download-button',
              },
            },
          ],
          metadata: {
            materializer: 'fixture-resume',
          },
        };
      },
    });

    const created = await service.createGeneration({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      transport: 'browser',
      source: 'cli',
    });
    const materialized = await service.materializeGeneration?.('medgen_resume_1', {
      count: 1,
      compareFullQuality: true,
      source: 'cli',
    });

    expect(materialized).toMatchObject({
      id: 'medgen_resume_1',
      status: 'succeeded',
      artifacts: [
        { id: 'preview_1' },
        {
          id: 'full_quality_1',
          metadata: {
            materialization: 'download-button',
          },
        },
      ],
      metadata: {
        executor: 'fixture',
        materializer: 'fixture-resume',
        resumedArtifactCount: 1,
      },
    });
    expect(materialized?.completedAt).toBe(created.completedAt);
    expect(materialized?.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'executor_started',
      'completed',
      'artifact_poll',
      'artifact_materialized',
    ]);
    await expect(service.readGeneration('medgen_resume_1')).resolves.toEqual(materialized);
  });

  it('accepts Gemini music generation requests in the shared contract', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-music-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-22T12:00:00.000Z'),
      generateId: () => 'medgen_music_1',
      executor: async ({ artifactDir }) => {
        const filePath = path.join(artifactDir, 'track.mp4');
        await fs.writeFile(filePath, Buffer.from('fake music bytes'));
        return {
          model: 'fake-gemini-music',
          artifacts: [
            {
              id: 'artifact_music_1',
              type: 'music',
              mimeType: 'video/mp4',
              fileName: 'track.mp4',
              path: filePath,
              durationSeconds: 12,
              metadata: {
                transportMediaType: 'video',
              },
            },
          ],
        };
      },
    });

    const created = await service.createGeneration({
      provider: 'gemini',
      mediaType: 'music',
      prompt: 'Create a short spy theme for an asphalt secret agent',
      source: 'api',
    });

    expect(created).toMatchObject({
      id: 'medgen_music_1',
      status: 'succeeded',
      provider: 'gemini',
      mediaType: 'music',
      artifacts: [
        {
          id: 'artifact_music_1',
          type: 'music',
          mimeType: 'video/mp4',
          durationSeconds: 12,
          metadata: {
            transportMediaType: 'video',
          },
        },
      ],
    });
  });

  it('checks Gemini browser media capability before invoking the executor', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-capability-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let invoked = false;
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-22T12:00:00.000Z'),
      generateId: () => 'medgen_capability_1',
      capabilityReporter: createCapabilityReporter('available'),
      runtimeProfile: 'default',
      executor: async () => {
        invoked = true;
        return {
          model: 'gemini-browser',
          artifacts: [
            {
              id: 'artifact_capability_1',
              type: 'image',
              mimeType: 'image/png',
            },
          ],
        };
      },
    });

    const created = await service.createGeneration({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      source: 'api',
      transport: 'browser',
    });

    expect(invoked).toBe(true);
    expect(created).toMatchObject({
      status: 'succeeded',
      metadata: {
        transport: 'browser',
        workbenchCapability: {
          id: 'gemini.media.create_image',
          availability: 'available',
          source: 'test_fixture',
        },
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'capability_discovered',
      'executor_started',
      'completed',
    ]);
  });

  it('fails Gemini browser media generation when the matching capability is not available', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-capability-miss-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let invoked = false;
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-22T12:00:00.000Z'),
      generateId: () => 'medgen_capability_miss_1',
      capabilityReporter: createCapabilityReporter('unknown'),
      runtimeProfile: 'default',
      executor: async () => {
        invoked = true;
        return { artifacts: [] };
      },
    });

    const created = await service.createGeneration({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      source: 'api',
      transport: 'browser',
    });

    expect(invoked).toBe(false);
    expect(created).toMatchObject({
      id: 'medgen_capability_miss_1',
      status: 'failed',
      provider: 'gemini',
      mediaType: 'image',
      failure: {
        code: 'media_capability_unavailable',
        details: {
          capabilityId: 'gemini.media.create_image',
          availability: 'unknown',
          inspectionCommand: 'auracall capabilities --target gemini --json',
          runtimeProfile: 'default',
          transport: 'browser',
          workbenchCapability: {
            id: 'gemini.media.create_image',
            availability: 'unknown',
          },
        },
      },
      metadata: {
        capabilityId: 'gemini.media.create_image',
        capabilityAvailability: 'unknown',
        failureCode: 'media_capability_unavailable',
        workbenchCapability: {
          id: 'gemini.media.create_image',
          availability: 'unknown',
        },
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'capability_unavailable',
      'failed',
    ]);
    await expect(service.readGeneration('medgen_capability_miss_1')).resolves.toEqual(created);
  });

  it('fails Grok browser media generation before prompt submission when Imagine is account-gated', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-grok-gated-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let invoked = false;
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      generateId: () => 'medgen_grok_gated_1',
      capabilityReporter: createCapabilityReporter('account_gated', 'grok'),
      runtimeProfile: 'default',
      executor: async () => {
        invoked = true;
        return { artifacts: [] };
      },
    });

    const created = await service.createGeneration({
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      source: 'api',
      transport: 'browser',
    });

    expect(invoked).toBe(false);
    expect(created).toMatchObject({
      id: 'medgen_grok_gated_1',
      status: 'failed',
      provider: 'grok',
      mediaType: 'image',
      failure: {
        code: 'media_capability_unavailable',
        details: {
          capabilityId: 'grok.media.imagine_image',
          availability: 'account_gated',
          inspectionCommand: 'auracall capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json',
          runtimeProfile: 'default',
          transport: 'browser',
          workbenchCapability: {
            id: 'grok.media.imagine_image',
            availability: 'account_gated',
          },
        },
      },
      metadata: {
        capabilityId: 'grok.media.imagine_image',
        capabilityAvailability: 'account_gated',
        failureCode: 'media_capability_unavailable',
        workbenchCapability: {
          id: 'grok.media.imagine_image',
          availability: 'account_gated',
        },
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'capability_unavailable',
      'failed',
    ]);
  });

  it('requests explicit Grok video-mode discovery before invoking browser video execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-grok-video-preflight-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const capabilityRequests: unknown[] = [];
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      generateId: () => 'medgen_grok_video_preflight_1',
      runtimeProfile: 'default',
      capabilityReporter: {
        async listCapabilities(request) {
          capabilityRequests.push(request);
          return {
            object: 'workbench_capability_report',
            generatedAt: '2026-04-24T12:00:00.000Z',
            provider: 'grok',
            category: 'media',
            runtimeProfile: 'default',
            capabilities: [
              {
                id: 'grok.media.imagine_video',
                provider: 'grok',
                providerLabels: ['Imagine'],
                category: 'media',
                invocationMode: 'post_prompt_action',
                surfaces: ['browser_service', 'local_api', 'mcp'],
                availability: 'available',
                stability: 'observed',
                requiredInputs: [{ name: 'prompt', required: true }],
                output: { artifactTypes: ['video'] },
                safety: {},
                observedAt: '2026-04-24T12:00:00.000Z',
                source: 'browser_discovery',
                metadata: {
                  discoveryAction: {
                    action: 'grok-imagine-video-mode',
                    videoModeAudit: {
                      composer: [{ tag: 'div', placeholder: 'Type to imagine' }],
                      generatedMediaSelectorCount: 2,
                    },
                  },
                },
              },
            ],
            summary: {
              total: 1,
              available: 1,
              accountGated: 0,
              unknown: 0,
              blocked: 0,
            },
          };
        },
      },
      executor: async ({ workbenchCapability, emitTimeline }) => {
        await emitTimeline?.({
          event: 'submitted_state_observed',
          details: {
            submitted: false,
            capabilityId: workbenchCapability?.id ?? null,
            videoModeAudit: workbenchCapability?.metadata?.discoveryAction,
          },
        });
        throw new MediaGenerationExecutionError('media_provider_not_implemented', 'video skeleton stop', {
          capabilityId: workbenchCapability?.id ?? null,
        });
      },
    });

    const created = await service.createGeneration({
      provider: 'grok',
      mediaType: 'video',
      prompt: 'Generate a video of an asphalt secret agent',
      source: 'api',
      transport: 'browser',
    });

    expect(capabilityRequests).toEqual([
      expect.objectContaining({
        provider: 'grok',
        category: 'media',
        entrypoint: 'grok-imagine',
        diagnostics: 'browser-state',
        discoveryAction: 'grok-imagine-video-mode',
      }),
    ]);
    expect(created).toMatchObject({
      id: 'medgen_grok_video_preflight_1',
      status: 'failed',
      mediaType: 'video',
      failure: {
        code: 'media_provider_not_implemented',
        details: {
          capabilityId: 'grok.media.imagine_video',
        },
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'capability_discovered',
      'executor_started',
      'submitted_state_observed',
      'failed',
    ]);
  });

  it('skips Grok video capability preflight for explicit existing-tab readback probes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-generation-grok-video-readback-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const capabilityRequests: unknown[] = [];
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      generateId: () => 'medgen_grok_video_readback_1',
      runtimeProfile: 'default',
      capabilityReporter: {
        async listCapabilities(request) {
          capabilityRequests.push(request);
          throw new Error('readback probes must not preflight capabilities');
        },
      },
      executor: async ({ artifactDir, workbenchCapability, emitTimeline }) => {
        await emitTimeline?.({
          event: 'run_state_observed',
          details: {
            state: 'terminal_video',
            pending: false,
            terminalVideo: true,
            generatedVideoCount: 1,
          },
        });
        const filePath = path.join(artifactDir, 'grok-video.mp4');
        await fs.writeFile(filePath, Buffer.from('fake grok video bytes'));
        return {
          model: 'grok-imagine-video',
          artifacts: [
            {
              id: 'grok_video_readback_1',
              type: 'video',
              mimeType: 'video/mp4',
              fileName: 'grok-video.mp4',
              path: filePath,
            },
          ],
          metadata: {
            executorSawCapability: workbenchCapability?.id ?? null,
          },
        };
      },
    });

    const created = await service.createGeneration({
      provider: 'grok',
      mediaType: 'video',
      prompt: 'Manual readback probe only; do not submit.',
      source: 'api',
      transport: 'browser',
      metadata: {
        grokVideoReadbackProbe: true,
        grokVideoReadbackTabTargetId: 'manual-tab-1',
        grokVideoReadbackDevtoolsPort: 38261,
      },
    });

    expect(capabilityRequests).toEqual([]);
    expect(created).toMatchObject({
      id: 'medgen_grok_video_readback_1',
      status: 'succeeded',
      mediaType: 'video',
      metadata: {
        grokVideoReadbackProbe: true,
        grokVideoReadbackTabTargetId: 'manual-tab-1',
        grokVideoReadbackDevtoolsPort: 38261,
        executorSawCapability: null,
      },
      artifacts: [
        {
          id: 'grok_video_readback_1',
          type: 'video',
          mimeType: 'video/mp4',
          fileName: 'grok-video.mp4',
        },
      ],
    });
    expect(created.metadata?.workbenchCapability).toBeUndefined();
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'executor_started',
      'run_state_observed',
      'completed',
    ]);
  });
});

function createCapabilityReporter(
  availability: 'available' | 'unknown' | 'account_gated',
  provider: 'gemini' | 'grok' = 'gemini',
): WorkbenchCapabilityReporter {
  return {
    async listCapabilities(request) {
      const capabilityId = provider === 'grok' ? 'grok.media.imagine_image' : 'gemini.media.create_image';
      return {
        object: 'workbench_capability_report',
        generatedAt: '2026-04-22T12:00:00.000Z',
        provider: request?.provider ?? provider,
        category: request?.category ?? 'media',
        runtimeProfile: request?.runtimeProfile ?? null,
        capabilities: [
          {
            id: capabilityId,
            provider,
            providerLabels: provider === 'grok' ? ['Imagine'] : ['Create image'],
            category: 'media',
            invocationMode: 'tool_drawer_selection',
            surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
            availability,
            stability: 'observed',
            requiredInputs: [{ name: 'prompt', required: true }],
            output: { artifactTypes: ['image'] },
            safety: {},
            observedAt: '2026-04-22T12:00:00.000Z',
            source: 'test_fixture',
          },
        ],
        summary: {
          total: 1,
          available: availability === 'available' ? 1 : 0,
          accountGated: availability === 'account_gated' ? 1 : 0,
          unknown: availability === 'unknown' ? 1 : 0,
          blocked: 0,
        },
      };
    },
  };
}
