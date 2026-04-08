import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import {
  createExecutionRunRecordStore,
  ensureExecutionRunStorage,
  getExecutionRunBundlePath,
  getExecutionRunsDir,
  listExecutionRunRecordBundles,
  readExecutionRunRecordBundle,
  writeExecutionRunRecordBundle,
} from '../src/runtime/store.js';
import { createTeamRunBundle } from '../src/teams/model.js';

describe('runtime execution store', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('persists and reloads execution run bundles under the AuraCall home dir', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    await ensureExecutionRunStorage();
    expect(getExecutionRunsDir()).toBe(path.join(homeDir, 'runtime', 'runs'));

    const bundle = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_1',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_1:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'analysis',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'Investigate the regression.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const bundlePath = await writeExecutionRunRecordBundle(bundle);
    expect(bundlePath).toBe(getExecutionRunBundlePath('team_run_1'));

    const loaded = await readExecutionRunRecordBundle('team_run_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.run.id).toBe('team_run_1');
    expect(loaded?.steps).toHaveLength(1);
  });

  it('lists persisted bundles in reverse chronological order with filters', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-store-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const directStore = createExecutionRunRecordStore();
    await directStore.ensureStorage();

    const older = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_older',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_older:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'Older bundle',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const newerBase = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_newer',
        teamId: 'ops',
        createdAt: '2026-04-07T01:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_newer:step:1',
            agentId: 'reviewer',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'review',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'Newer bundle',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const newer = {
      ...newerBase,
      run: {
        ...newerBase.run,
        status: 'running' as const,
      },
    };

    await directStore.writeBundle(older);
    await directStore.writeBundle(newer);

    const listed = await listExecutionRunRecordBundles();
    expect(listed.map((entry) => entry.run.id)).toEqual(['team_run_newer', 'team_run_older']);

    const filtered = await listExecutionRunRecordBundles({ status: 'running', limit: 1 });
    expect(filtered.map((entry) => entry.run.id)).toEqual(['team_run_newer']);
  });
});
