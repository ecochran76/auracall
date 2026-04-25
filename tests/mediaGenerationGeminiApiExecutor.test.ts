import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiApiMediaGenerationExecutor } from '../src/media/geminiApiExecutor.js';
import { MediaGenerationExecutionError } from '../src/media/service.js';
import type { MediaGenerationTimelineEvent } from '../src/media/types.js';

describe('Gemini API media generation executor', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('generates and caches Gemini API image bytes through generateImages', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-api-image-'));
    cleanup.push(artifactDir);
    const timeline: MediaGenerationTimelineEvent[] = [];
    const generateImages = vi.fn(async () => ({
      generatedImages: [
        {
          image: {
            imageBytes: Buffer.from('fake png bytes').toString('base64'),
            mimeType: 'image/png',
          },
          enhancedPrompt: 'Enhanced asphalt secret agent',
        },
      ],
    }));
    const executor = createGeminiApiMediaGenerationExecutor({
      client: { generateImages },
    });

    const result = await executor({
      id: 'medgen_gemini_api_1',
      createdAt: '2026-04-25T21:00:00.000Z',
      artifactDir,
      request: {
        provider: 'gemini',
        mediaType: 'image',
        transport: 'api',
        prompt: 'Generate an image of an asphalt secret agent',
        count: 2,
        aspectRatio: '1:1',
        size: '1K',
        source: 'api',
      },
      emitTimeline: (event) => {
        timeline.push({
          event: event.event,
          at: event.at ?? '2026-04-25T21:00:00.000Z',
          details: event.details ?? null,
        });
      },
    });

    expect(generateImages).toHaveBeenCalledWith({
      model: 'imagen-4.0-generate-001',
      prompt: 'Generate an image of an asphalt secret agent',
      config: {
        numberOfImages: 2,
        includeRaiReason: true,
        aspectRatio: '1:1',
        imageSize: '1K',
      },
    });
    expect(result).toMatchObject({
      model: 'imagen-4.0-generate-001',
      metadata: {
        executor: 'gemini-api',
        apiMethod: 'models.generateImages',
        requestedImageCount: 2,
        returnedImageCount: 1,
      },
      artifacts: [
        {
          id: 'gemini_api_image_1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'gemini_api_image_1.png',
          metadata: {
            materialization: 'gemini-api-inline-bytes',
            enhancedPrompt: 'Enhanced asphalt secret agent',
          },
        },
      ],
    });
    await expect(fs.readFile(result.artifacts[0]?.path ?? '', 'utf8')).resolves.toBe('fake png bytes');
    expect(timeline.map((entry) => entry.event)).toEqual([
      'prompt_submitted',
      'image_visible',
      'artifact_materialized',
    ]);
  });

  it('fails before provider work when GEMINI_API_KEY is missing', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-api-missing-key-'));
    cleanup.push(artifactDir);
    const executor = createGeminiApiMediaGenerationExecutor({
      env: {},
    });

    await expect(executor({
      id: 'medgen_gemini_api_missing_key',
      createdAt: '2026-04-25T21:00:00.000Z',
      artifactDir,
      request: {
        provider: 'gemini',
        mediaType: 'image',
        transport: 'api',
        prompt: 'Generate an image of an asphalt secret agent',
      },
    })).rejects.toMatchObject({
      code: 'gemini_api_key_missing',
    } satisfies Partial<MediaGenerationExecutionError>);
  });

  it('reports filtered empty Gemini API image responses as no generated output', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-api-filtered-'));
    cleanup.push(artifactDir);
    const executor = createGeminiApiMediaGenerationExecutor({
      client: {
        generateImages: vi.fn(async () => ({
          generatedImages: [
            {
              raiFilteredReason: 'filtered',
            },
          ],
        })),
      },
    });

    await expect(executor({
      id: 'medgen_gemini_api_filtered',
      createdAt: '2026-04-25T21:00:00.000Z',
      artifactDir,
      request: {
        provider: 'gemini',
        mediaType: 'image',
        transport: 'api',
        prompt: 'Generate an image',
      },
    })).rejects.toMatchObject({
      code: 'media_generation_no_generated_output',
    } satisfies Partial<MediaGenerationExecutionError>);
  });
});
