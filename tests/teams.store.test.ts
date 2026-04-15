import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createTaskRunSpec } from '../src/teams/model.js';
import {
  createTaskRunSpecRecordStore,
  ensureTaskRunSpecStorage,
  getTaskRunSpecPath,
  getTaskRunSpecRecordPath,
  getTaskRunSpecsDir,
  readTaskRunSpec,
  readTaskRunSpecStoredRecord,
  writeTaskRunSpec,
  writeTaskRunSpecStoredRecord,
} from '../src/teams/store.js';

describe('team task-run-spec store', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('persists and reloads task run specs under the AuraCall home dir', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-taskrunspec-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await ensureTaskRunSpecStorage();
    expect(getTaskRunSpecsDir()).toBe(path.join(homeDir, 'teams', 'task-run-specs'));

    const spec = createTaskRunSpec({
      id: 'task_store_1',
      teamId: 'ops',
      title: 'Persist task spec',
      objective: 'Validate durable task spec storage.',
      createdAt: '2026-04-14T12:00:00.000Z',
    });

    const specPath = await writeTaskRunSpec(spec);
    expect(specPath).toBe(getTaskRunSpecPath('task_store_1'));

    const loaded = await readTaskRunSpec('task_store_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('task_store_1');
    expect(loaded?.teamId).toBe('ops');

    const stored = await readTaskRunSpecStoredRecord('task_store_1');
    expect(stored?.taskRunSpecId).toBe('task_store_1');
    expect(stored?.revision).toBe(1);
    expect(stored?.spec.id).toBe('task_store_1');
    expect(getTaskRunSpecRecordPath('task_store_1')).toContain('record.json');
  });

  it('supports compare-and-swap style task run spec writes through revision checks', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-taskrunspec-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const base = createTaskRunSpec({
      id: 'task_store_cas',
      teamId: 'ops',
      title: 'CAS task spec',
      objective: 'Validate revision-checked writes.',
      createdAt: '2026-04-14T12:05:00.000Z',
    });

    const firstWrite = await writeTaskRunSpecStoredRecord(base);
    expect(firstWrite.revision).toBe(1);

    const nextSpec = {
      ...base,
      title: 'CAS task spec updated',
    };

    const secondWrite = await writeTaskRunSpecStoredRecord(nextSpec, { expectedRevision: 1 });
    expect(secondWrite.revision).toBe(2);
    expect(secondWrite.spec.title).toBe('CAS task spec updated');

    await expect(writeTaskRunSpecStoredRecord(nextSpec, { expectedRevision: 1 })).rejects.toThrow(
      /revision mismatch/,
    );
  });

  it('exposes a store facade for task run spec record access', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-taskrunspec-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const store = createTaskRunSpecRecordStore();
    await store.ensureStorage();

    const spec = createTaskRunSpec({
      id: 'task_store_facade',
      teamId: 'ops',
      title: 'Facade task spec',
      objective: 'Validate the record-store facade.',
      createdAt: '2026-04-14T12:10:00.000Z',
    });

    await store.writeRecord(spec, { expectedRevision: 0 });
    const loaded = await store.readRecord('task_store_facade');
    expect(loaded?.spec.objective).toBe('Validate the record-store facade.');
  });
});
