import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRunnerRecord } from '../src/runtime/model.js';
import {
  createExecutionRunnerRecordStore,
  ensureExecutionRunnerStorage,
  getExecutionRunnerPath,
  getExecutionRunnerRecordPath,
  getExecutionRunnersDir,
  listExecutionRunnerRecords,
  readExecutionRunnerRecord,
  readExecutionRunnerStoredRecord,
  writeExecutionRunnerStoredRecord,
} from '../src/runtime/runnersStore.js';

describe('runtime runner store', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('persists and reloads runner records under the AuraCall home dir', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await ensureExecutionRunnerStorage();
    expect(getExecutionRunnersDir()).toBe(path.join(homeDir, 'runtime', 'runners'));

    const runner = createExecutionRunnerRecord({
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
    });

    const stored = await writeExecutionRunnerStoredRecord(runner);
    expect(stored.revision).toBe(1);
    expect(getExecutionRunnerPath(runner.id)).toContain('runner.json');
    expect(getExecutionRunnerRecordPath(runner.id)).toContain('record.json');

    const loaded = await readExecutionRunnerRecord(runner.id);
    expect(loaded?.id).toBe(runner.id);
    expect(loaded?.hostId).toBe('host:wsl-dev-1');

    const reloadedRecord = await readExecutionRunnerStoredRecord(runner.id);
    expect(reloadedRecord?.runnerId).toBe(runner.id);
    expect(reloadedRecord?.revision).toBe(1);
  });

  it('lists persisted runner records in reverse heartbeat order with filters', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const store = createExecutionRunnerRecordStore();
    await store.ensureStorage();

    await store.writeRunner(
      createExecutionRunnerRecord({
        id: 'runner:older',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T10:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:00:00.000Z',
        expiresAt: '2026-04-11T10:01:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
      }),
    );
    await store.writeRunner(
      createExecutionRunnerRecord({
        id: 'runner:newer',
        hostId: 'host:linux-2',
        status: 'stale',
        startedAt: '2026-04-11T10:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T10:02:00.000Z',
        expiresAt: '2026-04-11T10:02:30.000Z',
        serviceIds: ['gemini'],
        runtimeProfileIds: ['batch'],
      }),
    );

    const listed = await listExecutionRunnerRecords();
    expect(listed.map((entry) => entry.id)).toEqual(['runner:newer', 'runner:older']);

    const filtered = await listExecutionRunnerRecords({ status: 'stale', hostId: 'host:linux-2', serviceId: 'gemini' });
    expect(filtered.map((entry) => entry.id)).toEqual(['runner:newer']);
  });

  it('supports compare-and-swap writes through revision checks', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-runners-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const runner = createExecutionRunnerRecord({
      id: 'runner:cas',
      hostId: 'host:wsl-dev-1',
      startedAt: '2026-04-11T10:00:00.000Z',
      expiresAt: '2026-04-11T10:01:00.000Z',
      serviceIds: ['chatgpt'],
      runtimeProfileIds: ['default'],
    });

    const firstWrite = await writeExecutionRunnerStoredRecord(runner);
    expect(firstWrite.revision).toBe(1);

    const nextRunner = createExecutionRunnerRecord({
      ...runner,
      startedAt: runner.startedAt,
      lastHeartbeatAt: '2026-04-11T10:00:30.000Z',
      expiresAt: '2026-04-11T10:01:30.000Z',
    });

    const secondWrite = await writeExecutionRunnerStoredRecord(nextRunner, { expectedRevision: 1 });
    expect(secondWrite.revision).toBe(2);
    expect(secondWrite.runner.lastHeartbeatAt).toBe('2026-04-11T10:00:30.000Z');

    await expect(writeExecutionRunnerStoredRecord(nextRunner, { expectedRevision: 1 })).rejects.toThrow(
      /revision mismatch/,
    );
  });
});
