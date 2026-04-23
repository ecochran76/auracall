import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createMediaGenerationService } from '../src/media/service.js';
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
          runtimeProfile: 'default',
          transport: 'browser',
        },
      },
    });
    expect(created.timeline?.map((entry) => entry.event)).toEqual([
      'running_persisted',
      'failed',
    ]);
    await expect(service.readGeneration('medgen_capability_miss_1')).resolves.toEqual(created);
  });
});

function createCapabilityReporter(availability: 'available' | 'unknown'): WorkbenchCapabilityReporter {
  return {
    async listCapabilities(request) {
      return {
        object: 'workbench_capability_report',
        generatedAt: '2026-04-22T12:00:00.000Z',
        provider: request?.provider ?? 'gemini',
        category: request?.category ?? 'media',
        runtimeProfile: request?.runtimeProfile ?? null,
        capabilities: [
          {
            id: 'gemini.media.create_image',
            provider: 'gemini',
            providerLabels: ['Create image'],
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
          accountGated: 0,
          unknown: availability === 'unknown' ? 1 : 0,
          blocked: 0,
        },
      };
    },
  };
}
