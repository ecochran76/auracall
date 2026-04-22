import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

describe('http media generation adapter', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('creates and retrieves media generations through the local API', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-media-generation-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-22T12:00:00.000Z'),
        mediaGenerationExecutor: async ({ artifactDir }) => {
          const filePath = path.join(artifactDir, 'asphalt-agent.png');
          await fs.writeFile(filePath, Buffer.from('fake image bytes'));
          return {
            model: 'fake-gemini-image',
            artifacts: [
              {
                id: 'artifact_http_1',
                type: 'image',
                mimeType: 'image/png',
                fileName: 'asphalt-agent.png',
                path: filePath,
                uri: `file://${filePath}`,
              },
            ],
          };
        },
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/media-generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image of an asphalt secret agent',
          aspectRatio: '1:1',
        }),
      });

      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        object: 'media_generation',
        status: 'succeeded',
        provider: 'gemini',
        mediaType: 'image',
        model: 'fake-gemini-image',
        artifacts: [
          {
            id: 'artifact_http_1',
            type: 'image',
            mimeType: 'image/png',
            fileName: 'asphalt-agent.png',
          },
        ],
        metadata: {
          source: 'api',
          aspectRatio: '1:1',
        },
      });

      const readResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/media-generations/${created.id}`,
      );
      expect(readResponse.status).toBe(200);
      await expect(readResponse.json()).resolves.toEqual(created);
    } finally {
      await server.close();
    }
  });

  it('advertises media generation routes in status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-media-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      const status = (await response.json()) as Record<string, { mediaGenerationsCreate?: string }>;
      expect(status.routes.mediaGenerationsCreate).toBe('/v1/media-generations');
    } finally {
      await server.close();
    }
  });
});
