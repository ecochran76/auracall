import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRunnerRecord } from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';

describe('runtime runner control', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('registers and reads a persisted runner through one control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRunnerControl();
    const created = await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:wsl-local-1',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        expiresAt: '2026-04-11T10:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
        eligibilityNote: 'WSL browser-bearing runner',
      }),
    });
    expect(created.revision).toBe(1);

    const read = await control.readRunner('runner:wsl-local-1');
    expect(read?.runner.hostId).toBe('host:wsl-dev-1');
    expect(read?.runner.browserCapable).toBe(true);
  });

  it('lists filtered runner records through the control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRunnerControl();
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:chatgpt',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        expiresAt: '2026-04-11T10:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:gemini',
        hostId: 'host:linux-2',
        status: 'stale',
        startedAt: '2026-04-11T10:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:02:00.000Z',
        expiresAt: '2026-04-11T10:02:30.000Z',
        serviceIds: ['gemini'],
        runtimeProfileIds: ['batch'],
      }),
    });

    const listed = await control.listRunners({ status: 'stale', serviceId: 'gemini' });
    expect(listed.map((record) => record.runnerId)).toEqual(['runner:gemini']);
  });

  it('heartbeats and marks runner liveness through the control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRunnerControl();
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:wsl-local-1',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        expiresAt: '2026-04-11T10:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const heartbeated = await control.heartbeatRunner({
      runnerId: 'runner:wsl-local-1',
      heartbeatAt: '2026-04-11T10:00:30.000Z',
      expiresAt: '2026-04-11T10:01:30.000Z',
      eligibilityNote: 'runner heartbeat refreshed by local host loop',
    });
    expect(heartbeated.revision).toBe(2);
    expect(heartbeated.runner.status).toBe('active');
    expect(heartbeated.runner.lastHeartbeatAt).toBe('2026-04-11T10:00:30.000Z');

    const stale = await control.markRunnerStale({
      runnerId: 'runner:wsl-local-1',
      staleAt: '2026-04-11T10:02:00.000Z',
      eligibilityNote: 'runner heartbeat expired',
    });
    expect(stale.revision).toBe(3);
    expect(stale.runner.status).toBe('stale');
    expect(stale.runner.expiresAt).toBe('2026-04-11T10:02:00.000Z');
    expect(stale.runner.eligibilityNote).toBe('runner heartbeat expired');
  });

  it('records bounded runner activity without changing liveness ownership', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRunnerControl();
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:wsl-local-1',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        expiresAt: '2026-04-11T10:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const activity = await control.recordRunnerActivity({
      runnerId: 'runner:wsl-local-1',
      runId: 'run_exec_1',
      activityAt: '2026-04-11T10:00:40.000Z',
      eligibilityNote: 'runner advanced one local run',
    });

    expect(activity.runner.status).toBe('active');
    expect(activity.runner.lastHeartbeatAt).toBe('2026-04-11T10:00:00.000Z');
    expect(activity.runner.lastActivityAt).toBe('2026-04-11T10:00:40.000Z');
    expect(activity.runner.lastClaimedRunId).toBe('run_exec_1');
    expect(activity.runner.eligibilityNote).toBe('runner advanced one local run');
  });

  it('expires stale active runners through one bounded sweep', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRunnerControl();
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:expired',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:00:15.000Z',
        expiresAt: '2026-04-11T10:00:30.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });
    await control.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:fresh',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:01:00.000Z',
        expiresAt: '2026-04-11T10:02:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    });

    const expired = await control.expireRunners({
      now: '2026-04-11T10:01:30.000Z',
      eligibilityNote: 'expired by bounded runner sweep',
    });

    expect(expired.expiredRunnerIds).toEqual(['runner:expired']);
    expect(expired.records[0]?.runner.status).toBe('stale');
    expect(expired.records[0]?.runner.eligibilityNote).toBe('expired by bounded runner sweep');

    const expiredRead = await control.readRunner('runner:expired');
    const freshRead = await control.readRunner('runner:fresh');
    expect(expiredRead?.runner.status).toBe('stale');
    expect(freshRead?.runner.status).toBe('active');
  });
});
