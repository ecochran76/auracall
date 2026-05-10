import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  getLazyLiveFollowPreflightRunHistoryPath,
  getLazyLiveFollowPreflightStatusPath,
  observeLazyLiveFollowPreflightRunOutput,
  readLazyLiveFollowPreflightRunHistory,
  readPreflightStatusSummary,
  recordLazyLiveFollowPreflightRun,
  writeLazyLiveFollowPreflightStatus,
} from '../src/preflightStatus.js';

describe('preflight status persistence', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('stores and reads the lazy-live-follow preflight status under AuraCall home', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-preflight-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await writeLazyLiveFollowPreflightStatus({
      object: 'auracall_preflight_status',
      name: 'lazy-live-follow',
      status: 'passed',
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: '2026-05-08T20:00:03.000Z',
      durationMs: 3000,
      failedStep: null,
      errorMessage: null,
    });

    await expect(fs.stat(getLazyLiveFollowPreflightStatusPath())).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
    await expect(readPreflightStatusSummary()).resolves.toEqual({
      lazyLiveFollow: {
        object: 'auracall_preflight_status',
        name: 'lazy-live-follow',
        status: 'passed',
        startedAt: '2026-05-08T20:00:00.000Z',
        completedAt: '2026-05-08T20:00:03.000Z',
        durationMs: 3000,
        failedStep: null,
        errorMessage: null,
      },
      lazyLiveFollowRun: null,
      lazyLiveFollowRunHistory: [],
    });
  });

  it('treats malformed preflight status JSON as missing', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-preflight-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await fs.mkdir(path.dirname(getLazyLiveFollowPreflightStatusPath()), { recursive: true });
    await fs.writeFile(getLazyLiveFollowPreflightStatusPath(), '{', 'utf8');

    await expect(readPreflightStatusSummary()).resolves.toEqual({
      lazyLiveFollow: null,
      lazyLiveFollowRun: null,
      lazyLiveFollowRunHistory: [],
    });
  });

  it('stores recent lazy-live-follow preflight runs by id', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-preflight-runs-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await recordLazyLiveFollowPreflightRun({
      object: 'auracall_preflight_run',
      id: 'preflight_lazy_live_follow_1',
      name: 'lazy-live-follow',
      status: 'queued',
      command: 'node',
      args: ['preflight.js'],
      cwd: '/tmp',
      logPath: path.join(homeDir, 'logs', 'preflight-lazy-live-follow-1.log'),
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: null,
      durationMs: null,
      exitCode: null,
      signal: null,
      errorMessage: null,
      steps: [
        {
          label: 'completion controls',
          status: 'running',
          command: 'pnpm run smoke:completion-control',
          startedAt: '2026-05-08T20:00:00.000Z',
          completedAt: null,
          durationMs: null,
          errorMessage: null,
        },
      ],
    });
    await recordLazyLiveFollowPreflightRun({
      object: 'auracall_preflight_run',
      id: 'preflight_lazy_live_follow_1',
      name: 'lazy-live-follow',
      status: 'passed',
      command: 'node',
      args: ['preflight.js'],
      cwd: '/tmp',
      logPath: path.join(homeDir, 'logs', 'preflight-lazy-live-follow-1.log'),
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: '2026-05-08T20:00:01.000Z',
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      errorMessage: null,
      steps: [
        {
          label: 'completion controls',
          status: 'passed',
          command: 'pnpm run smoke:completion-control',
          startedAt: '2026-05-08T20:00:00.000Z',
          completedAt: '2026-05-08T20:00:01.000Z',
          durationMs: 1000,
          errorMessage: null,
        },
      ],
    });

    await expect(fs.stat(getLazyLiveFollowPreflightRunHistoryPath())).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
    await expect(readLazyLiveFollowPreflightRunHistory()).resolves.toEqual([
      expect.objectContaining({
        id: 'preflight_lazy_live_follow_1',
        status: 'passed',
        exitCode: 0,
        steps: [
          expect.objectContaining({
            label: 'completion controls',
            status: 'passed',
            command: 'pnpm run smoke:completion-control',
          }),
        ],
      }),
    ]);
    await expect(readPreflightStatusSummary()).resolves.toMatchObject({
      lazyLiveFollowRunHistory: [
        {
          id: 'preflight_lazy_live_follow_1',
          status: 'passed',
        },
      ],
    });
  });

  it('updates run step progress from preflight output banners', () => {
    const run = {
      object: 'auracall_preflight_run' as const,
      id: 'preflight_lazy_live_follow_steps',
      name: 'lazy-live-follow' as const,
      status: 'running' as const,
      command: 'pnpm',
      args: ['run', 'preflight:lazy-live-follow'],
      cwd: '/tmp',
      logPath: '/tmp/preflight.log',
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: null,
      durationMs: null,
      exitCode: null,
      signal: null,
      errorMessage: null,
      steps: [],
    };

    observeLazyLiveFollowPreflightRunOutput(
      run,
      [
        '==== completion controls ====',
        '>> pnpm run smoke:completion-control',
        'completion-control smoke: pass',
        '==== completion hydration ====',
        '>> pnpm run smoke:completion-hydration',
      ].join('\n'),
    );

    expect(run.steps).toEqual([
      expect.objectContaining({
        label: 'completion controls',
        status: 'passed',
        command: 'pnpm run smoke:completion-control',
        completedAt: expect.any(String),
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        label: 'completion hydration',
        status: 'running',
        command: 'pnpm run smoke:completion-hydration',
        completedAt: null,
        durationMs: null,
      }),
    ]);
  });
});
