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

      const statusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/media-generations/${created.id}/status`,
      );
      expect(statusResponse.status).toBe(200);
      await expect(statusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'media_generation_status',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'artifact_http_1',
            fileName: 'asphalt-agent.png',
            path: expect.stringContaining('asphalt-agent.png'),
          },
        ],
        timeline: [
          {
            event: 'running_persisted',
          },
          {
            event: 'executor_started',
          },
          {
            event: 'completed',
          },
        ],
        lastEvent: {
          event: 'completed',
        },
        metadata: {
          source: 'api',
        },
      });

      const runStatusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runs/${created.id}/status`,
      );
      expect(runStatusResponse.status).toBe(200);
      await expect(runStatusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'auracall_run_status',
        kind: 'media_generation',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'artifact_http_1',
            fileName: 'asphalt-agent.png',
            path: expect.stringContaining('asphalt-agent.png'),
          },
        ],
        lastEvent: {
          event: 'completed',
        },
      });
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
      const status = (await response.json()) as Record<
        string,
        {
          mediaGenerationsCreate?: string;
          mediaGenerationsStatusTemplate?: string;
          runStatusTemplate?: string;
        }
      >;
      expect(status.routes.mediaGenerationsCreate).toBe('/v1/media-generations');
      expect(status.routes.mediaGenerationsStatusTemplate).toBe(
        '/v1/media-generations/{media_generation_id}/status',
      );
      expect(status.routes.runStatusTemplate).toBe('/v1/runs/{run_id}/status');
    } finally {
      await server.close();
    }
  });

  it('checks workbench capability availability before Gemini browser media execution', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-media-capability-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let invoked = false;
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-22T12:00:00.000Z'),
        mediaGenerationExecutor: async () => {
          invoked = true;
          return { artifacts: [] };
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
          transport: 'browser',
        }),
      });

      expect(createResponse.status).toBe(502);
      await expect(createResponse.json()).resolves.toMatchObject({
        object: 'media_generation',
        status: 'failed',
        provider: 'gemini',
        mediaType: 'image',
        failure: {
          code: 'media_capability_unavailable',
          details: {
            capabilityId: 'gemini.media.create_image',
            availability: 'unknown',
            transport: 'browser',
          },
        },
      });
      expect(invoked).toBe(false);
    } finally {
      await server.close();
    }
  });
});
