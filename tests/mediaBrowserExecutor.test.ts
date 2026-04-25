import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { resolveManagedProfileDirForUserConfig } from '../src/browser/profileStore.js';
import type { MediaGenerationExecutor } from '../src/media/types.js';
import { createFileBackedBrowserOperationDispatcher } from '../packages/browser-service/src/service/operationDispatcher.js';

const mediaExecutorMocks = vi.hoisted(() => {
  const geminiBrowserExecutor = vi.fn<MediaGenerationExecutor>();
  const geminiApiExecutor = vi.fn<MediaGenerationExecutor>();
  const grokBrowserExecutor = vi.fn<MediaGenerationExecutor>();
  return {
    geminiBrowserExecutor,
    geminiApiExecutor,
    grokBrowserExecutor,
  };
});

vi.mock('../src/media/geminiBrowserExecutor.js', () => ({
  createGeminiBrowserMediaGenerationExecutor: vi.fn(() => mediaExecutorMocks.geminiBrowserExecutor),
}));

vi.mock('../src/media/geminiApiExecutor.js', () => ({
  createGeminiApiMediaGenerationExecutor: vi.fn(() => mediaExecutorMocks.geminiApiExecutor),
}));

vi.mock('../src/media/grokBrowserExecutor.js', () => ({
  createGrokBrowserMediaGenerationExecutor: vi.fn(() => mediaExecutorMocks.grokBrowserExecutor),
}));

describe('browser media generation executor queueing', () => {
  const cleanup: string[] = [];

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('queues Gemini browser media execution behind an active same-profile operation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-browser-queue-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const userConfig = {
      auracallProfile: 'default',
      browser: {
        managedProfileRoot: path.join(homeDir, 'browser-profiles'),
      },
    } as never;
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(homeDir, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const managedProfileDir = resolveManagedProfileDirForUserConfig(userConfig, 'gemini');
    const active = await dispatcher.acquire({
      managedProfileDir,
      serviceTarget: 'gemini',
      kind: 'browser-execution',
      operationClass: 'exclusive-mutating',
      ownerPid: process.pid,
      ownerCommand: 'test-active-operation',
    });
    expect(active.acquired).toBe(true);
    if (!active.acquired) return;
    mediaExecutorMocks.geminiBrowserExecutor.mockResolvedValueOnce({
      artifacts: [
        {
          id: 'artifact_1',
          type: 'image',
          mimeType: 'image/png',
        },
      ],
      metadata: {
        executor: 'gemini-browser-test',
      },
    });
    const { createBrowserMediaGenerationExecutor } = await import('../src/media/browserExecutor.js');
    const executor = createBrowserMediaGenerationExecutor(userConfig);
    const timeline: Array<{ event: string; details?: Record<string, unknown> | null }> = [];

    const running = executor({
      id: 'medgen_queue_1',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir: path.join(homeDir, 'artifacts'),
      emitTimeline: async (event) => {
        timeline.push(event);
      },
      request: {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          browserOperationQueueTimeoutMs: 200,
          browserOperationQueuePollMs: 5,
        },
      },
    });

    await vi.waitFor(() => {
      expect(timeline.some((entry) => entry.event === 'browser_operation_queued')).toBe(true);
    });
    await active.release();
    const result = await running;

    expect(result).toMatchObject({
      artifacts: [{ id: 'artifact_1' }],
      metadata: {
        executor: 'gemini-browser-test',
      },
    });
    expect(mediaExecutorMocks.geminiBrowserExecutor).toHaveBeenCalledTimes(1);
    expect(timeline.map((entry) => entry.event)).toEqual([
      'browser_operation_queued',
      'browser_operation_acquired',
    ]);
    expect(timeline[0]?.details).toMatchObject({
      blockedBy: {
        kind: 'browser-execution',
        ownerCommand: 'test-active-operation',
      },
    });
    expect(timeline[1]?.details).toMatchObject({
      operation: {
        kind: 'media-generation',
        ownerCommand: 'media-generation:gemini:image',
        serviceTarget: 'gemini',
      },
    });
  });

  it('returns a media execution busy error when queued acquisition times out', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-media-browser-busy-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const userConfig = {
      auracallProfile: 'default',
      browser: {
        managedProfileRoot: path.join(homeDir, 'browser-profiles'),
      },
    } as never;
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(homeDir, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const active = await dispatcher.acquire({
      managedProfileDir: resolveManagedProfileDirForUserConfig(userConfig, 'grok'),
      serviceTarget: 'grok',
      kind: 'setup',
      operationClass: 'exclusive-human',
      ownerPid: process.pid,
      ownerCommand: 'manual-verification',
    });
    expect(active.acquired).toBe(true);
    if (!active.acquired) return;
    const { createBrowserMediaGenerationExecutor } = await import('../src/media/browserExecutor.js');
    const executor = createBrowserMediaGenerationExecutor(userConfig);

    await expect(executor({
      id: 'medgen_busy_1',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir: path.join(homeDir, 'artifacts'),
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          browserOperationQueueTimeoutMs: 1,
          browserOperationQueuePollMs: 1,
        },
      },
    })).rejects.toMatchObject({
      code: 'browser_operation_busy',
      details: {
        blockedBy: {
          kind: 'setup',
          ownerCommand: 'manual-verification',
        },
      },
    });
    expect(mediaExecutorMocks.grokBrowserExecutor).not.toHaveBeenCalled();
    await active.release();
  });

  it('uses a raw DevTools dispatcher key for explicit Grok video readback probes', async () => {
    const { resolveBrowserMediaOperationKeyForTest } = await import('../src/media/browserExecutor.js');
    const key = resolveBrowserMediaOperationKeyForTest({} as never, {
      id: 'medgen_readback_key',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir: '/tmp/artifacts',
      request: {
        provider: 'grok',
        mediaType: 'video',
        prompt: 'Read back existing Grok video',
        transport: 'browser',
        metadata: {
          grokVideoReadbackProbe: true,
          grokVideoReadbackDevtoolsHost: '127.0.0.1',
          grokVideoReadbackDevtoolsPort: 38261,
          grokVideoReadbackTabTargetId: 'tab-1',
        },
      },
    });

    expect(key).toBe('devtools:127.0.0.1:38261');
  });
});
