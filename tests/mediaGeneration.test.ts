import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createMediaGenerationService } from '../src/media/service.js';

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
    ];
    const service = createMediaGenerationService({
      now: () => new Date(nowValues[Math.min(nowIndex++, nowValues.length - 1)]),
      generateId: () => 'medgen_test_1',
      executor: async ({ artifactDir }) => {
        const filePath = path.join(artifactDir, 'fake.png');
        await fs.writeFile(filePath, Buffer.from('fake image bytes'));
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
    });
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
});
