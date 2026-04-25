import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { createGeminiMusicVariantResponse } from './fixtures/geminiMusicStatusFixture.js';
import { createGrokImagineVideoResponse } from './fixtures/grokImagineStatusFixture.js';

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
                metadata: {
                  downloadLabel: 'Download as MP3',
                  downloadVariant: 'mp3',
                  downloadOptions: ['Download as video with album art', 'Download as MP3'],
                },
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
            downloadLabel: 'Download as MP3',
            downloadVariant: 'mp3',
            downloadOptions: ['Download as video with album art', 'Download as MP3'],
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
        diagnostics: {
          capability: {
            id: null,
          },
          provider: {
            routeProgression: [],
          },
        },
        metadata: {
          source: 'api',
        },
      });

      const diagnosticStatusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/media-generations/${created.id}/status?diagnostics=browser-state`,
      );
      expect(diagnosticStatusResponse.status).toBe(200);
      await expect(diagnosticStatusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'media_generation_status',
        browserDiagnostics: {
          probeStatus: 'unavailable',
          reason: `media generation ${created.id} is not actively running`,
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
            downloadLabel: 'Download as MP3',
            downloadVariant: 'mp3',
            downloadOptions: ['Download as video with album art', 'Download as MP3'],
          },
        ],
        lastEvent: {
          event: 'completed',
        },
        metadata: {
          mediaDiagnostics: {
            capability: {
              id: null,
            },
          },
        },
      });

      const diagnosticRunStatusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/runs/${created.id}/status?diagnostics=browser-state`,
      );
      expect(diagnosticRunStatusResponse.status).toBe(200);
      await expect(diagnosticRunStatusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'auracall_run_status',
        kind: 'media_generation',
        browserDiagnostics: {
          probeStatus: 'unavailable',
          reason: `media generation ${created.id} is not actively running`,
        },
      });
    } finally {
      await server.close();
    }
  });

  it('preserves Gemini music variants through local API status routes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-gemini-music-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const fixture = createGeminiMusicVariantResponse();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-25T16:50:02.035Z'),
        workbenchCapabilityCatalog: [
          {
            id: 'gemini.media.create_music',
            provider: 'gemini',
            providerLabels: ['Create music', 'Create Music', 'Music'],
            category: 'media',
            invocationMode: 'tool_drawer_selection',
            surfaces: ['local_api', 'mcp', 'browser_service'],
            availability: 'available',
            stability: 'observed',
            requiredInputs: [{ name: 'prompt', required: true }],
            output: { artifactTypes: ['music'] },
            safety: { maySpendCredits: true, mayTakeMinutes: true },
            source: 'test_fixture',
          },
        ],
        mediaGenerationExecutor: async ({ artifactDir, emitTimeline }) => {
          for (const event of (fixture.timeline ?? []).filter((entry) => (
            entry.event !== 'running_persisted' && entry.event !== 'completed'
          ))) {
            await emitTimeline?.(event);
          }
          const artifacts = await Promise.all(fixture.artifacts.map(async (artifact) => {
            const fileName = artifact.fileName ?? artifact.id;
            const filePath = path.join(artifactDir, fileName);
            await fs.writeFile(filePath, Buffer.from(`${artifact.id}\n`));
            return {
              ...artifact,
              path: filePath,
              uri: `file://${filePath}`,
            };
          }));
          return {
            artifacts,
            metadata: {
              conversationId: '62dd6ff9d85218b1',
              tabTargetId: 'gemini-tab-1',
              capabilityId: 'gemini.media.create_music',
              generatedArtifactCount: 1,
              artifactPollCount: 5,
            },
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
          mediaType: 'music',
          transport: 'browser',
          prompt: fixture.prompt,
        }),
      });
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        object: 'media_generation',
        status: 'succeeded',
        provider: 'gemini',
        mediaType: 'music',
        artifacts: [
          {
            fileName: 'Midnight_at_the_Harbor.mp4',
            mimeType: 'video/mp4',
          },
          {
            fileName: 'Midnight_at_the_Harbor.mp3',
            mimeType: 'audio/mpeg',
          },
        ],
      });

      const mediaStatusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/media-generations/${created.id}/status`,
      );
      expect(mediaStatusResponse.status).toBe(200);
      await expect(mediaStatusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'media_generation_status',
        status: 'succeeded',
        artifactCount: 2,
        artifacts: [
          {
            fileName: 'Midnight_at_the_Harbor.mp4',
            path: expect.stringContaining('Midnight_at_the_Harbor.mp4'),
            mimeType: 'video/mp4',
            materialization: 'generated-media-download-variant',
            downloadLabel: 'VideoAudio with cover art',
            downloadVariant: 'video_with_album_art',
            downloadOptions: ['Download track'],
          },
          {
            fileName: 'Midnight_at_the_Harbor.mp3',
            path: expect.stringContaining('Midnight_at_the_Harbor.mp3'),
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
        artifactCount: 2,
        artifacts: [
          {
            fileName: 'Midnight_at_the_Harbor.mp4',
            downloadVariant: 'video_with_album_art',
          },
          {
            fileName: 'Midnight_at_the_Harbor.mp3',
            downloadVariant: 'mp3',
          },
        ],
        metadata: {
          mediaDiagnostics: {
            runState: {
              runState: 'terminal_music',
              terminalMusic: true,
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it('preserves Grok Imagine video materialization through local API status routes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-grok-imagine-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const fixture = createGrokImagineVideoResponse();
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-25T17:20:44.000Z'),
        workbenchCapabilityCatalog: [
          {
            id: 'grok.media.imagine_video',
            provider: 'grok',
            providerLabels: ['Imagine', 'Video'],
            category: 'media',
            invocationMode: 'post_prompt_action',
            surfaces: ['local_api', 'mcp', 'browser_service'],
            availability: 'available',
            stability: 'observed',
            requiredInputs: [{ name: 'prompt', required: true }],
            output: { artifactTypes: ['video'] },
            safety: { maySpendCredits: true, mayTakeMinutes: true },
            source: 'test_fixture',
            metadata: {
              discoveryAction: {
                action: 'grok-imagine-video-mode',
              },
            },
          },
        ],
        mediaGenerationExecutor: async ({ artifactDir, emitTimeline }) => {
          for (const event of (fixture.timeline ?? []).filter((entry) => (
            entry.event !== 'running_persisted' && entry.event !== 'completed'
          ))) {
            await emitTimeline?.(event);
          }
          const artifact = fixture.artifacts[0];
          const fileName = artifact.fileName ?? 'grok-imagine-video-1.mp4';
          const filePath = path.join(artifactDir, fileName);
          await fs.writeFile(filePath, Buffer.from(`${artifact.id}\n`));
          return {
            artifacts: [
              {
                ...artifact,
                path: filePath,
                uri: `file://${filePath}`,
              },
            ],
            metadata: {
              tabUrl: 'https://grok.com/imagine/post/video-1',
              tabTargetId: 'grok-video-tab-1',
              capabilityId: 'grok.media.imagine_video',
              generatedArtifactCount: 1,
              artifactPollCount: 3,
              materializationCandidateSource: 'generated-video',
            },
          };
        },
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/media-generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'grok',
          mediaType: 'video',
          transport: 'browser',
          prompt: fixture.prompt,
        }),
      });
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        object: 'media_generation',
        status: 'succeeded',
        provider: 'grok',
        mediaType: 'video',
        artifacts: [
          {
            fileName: 'grok-imagine-video-1.mp4',
            mimeType: 'video/mp4',
          },
        ],
      });

      const mediaStatusResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/media-generations/${created.id}/status`,
      );
      expect(mediaStatusResponse.status).toBe(200);
      await expect(mediaStatusResponse.json()).resolves.toMatchObject({
        id: created.id,
        object: 'media_generation_status',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'grok_imagine_video_1',
            fileName: 'grok-imagine-video-1.mp4',
            path: expect.stringContaining('grok-imagine-video-1.mp4'),
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
            fileName: 'grok-imagine-video-1.mp4',
            materialization: 'remote-media-fetch',
          },
        ],
        metadata: {
          mediaDiagnostics: {
            runState: {
              runState: 'terminal_video',
              terminalVideo: true,
            },
            materialization: {
              materializationSource: 'generated-video',
            },
          },
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
        '/v1/media-generations/{media_generation_id}/status[?diagnostics=browser-state]',
      );
      expect(status.routes.runStatusTemplate).toBe('/v1/runs/{run_id}/status[?diagnostics=browser-state]');
    } finally {
      await server.close();
    }
  });

  it('can create a media generation asynchronously and poll it through run status', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-media-generation-async-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    let finishExecutor: () => void = () => {};
    const executorFinished = new Promise<void>((resolve) => {
      finishExecutor = resolve;
    });
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-22T12:00:00.000Z'),
        mediaGenerationExecutor: async ({ artifactDir, emitTimeline }) => {
          await emitTimeline?.({
            event: 'prompt_submitted',
            details: {
              conversationId: 'async-conversation',
              tabTargetId: 'async-tab-target',
              url: 'https://gemini.google.com/app/async-conversation',
            },
          });
          await executorFinished;
          const filePath = path.join(artifactDir, 'async-agent.png');
          await fs.writeFile(filePath, Buffer.from('fake async image bytes'));
          return {
            model: 'fake-gemini-image',
            artifacts: [
              {
                id: 'artifact_async_1',
                type: 'image',
                mimeType: 'image/png',
                fileName: 'async-agent.png',
                path: filePath,
                uri: `file://${filePath}`,
              },
            ],
          };
        },
      },
    );

    try {
      const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/media-generations?wait=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image of an asphalt secret agent',
          aspectRatio: '1:1',
        }),
      });

      expect(createResponse.status).toBe(202);
      const created = (await createResponse.json()) as Record<string, unknown>;
      expect(created).toMatchObject({
        object: 'media_generation',
        status: 'running',
        metadata: {
          source: 'api',
          aspectRatio: '1:1',
        },
      });

      const runningStatus = await waitForMediaTimelineEvent(server.port, String(created.id), 'prompt_submitted');
      expect(runningStatus).toMatchObject({
        id: created.id,
        object: 'media_generation_status',
        status: 'running',
        lastEvent: {
          event: 'prompt_submitted',
          details: {
            tabTargetId: 'async-tab-target',
          },
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
        status: 'running',
        lastEvent: {
          event: 'prompt_submitted',
        },
      });

      finishExecutor();
      const completedStatus = await waitForMediaTimelineEvent(server.port, String(created.id), 'completed');
      expect(completedStatus).toMatchObject({
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'artifact_async_1',
            fileName: 'async-agent.png',
            path: expect.stringContaining('async-agent.png'),
          },
        ],
      });
    } finally {
      finishExecutor();
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
      const body = await createResponse.json();
      expect(body).toMatchObject({
        object: 'media_generation',
        status: 'failed',
        provider: 'gemini',
        mediaType: 'image',
        metadata: {
          capabilityId: 'gemini.media.create_image',
          capabilityAvailability: 'unknown',
          failureCode: 'media_capability_unavailable',
        },
        failure: {
          code: 'media_capability_unavailable',
          details: {
            capabilityId: 'gemini.media.create_image',
            availability: 'unknown',
            inspectionCommand: 'auracall capabilities --target gemini --json',
            transport: 'browser',
          },
        },
      });
      expect((body as { timeline?: Array<{ event?: string }> }).timeline?.map((entry) => entry.event)).toEqual([
        'running_persisted',
        'capability_unavailable',
        'failed',
      ]);
      expect(invoked).toBe(false);
    } finally {
      await server.close();
    }
  });
});

async function waitForMediaTimelineEvent(port: number, id: string, event: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/v1/media-generations/${id}/status`);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    const status = body as Record<string, unknown> & {
      timeline?: Array<{ event?: string }>;
    };
    if (status.timeline?.some((entry) => entry.event === event)) {
      return status;
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for media generation ${id} timeline event ${event}`);
}
