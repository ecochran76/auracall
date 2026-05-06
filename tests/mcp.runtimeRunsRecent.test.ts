import { describe, expect, it, vi } from 'vitest';
import { createRuntimeRunsRecentToolHandler } from '../src/mcp/tools/runtimeRunsRecent.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createStoredRecord(runId = 'runtime_recent_mcp_1') {
  const bundle = createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId,
      teamId: 'ops',
      createdAt: '2026-05-05T20:00:00.000Z',
      trigger: 'service',
      taskRunSpecId: 'task_spec_recent_mcp_1',
      steps: [
        {
          id: `${runId}:step:1`,
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Inspect recent runtime state.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    }),
  );
  return {
    runId,
    revision: 1,
    persistedAt: '2026-05-05T20:00:01.000Z',
    bundle,
  };
}

describe('mcp runtime_runs_recent tool', () => {
  it('lists recent runtime runs without provider browser work', async () => {
    const listRuns = vi.fn(async () => [createStoredRecord()]);
    const handler = createRuntimeRunsRecentToolHandler({
      control: {
        listRuns,
      },
    });

    const result = await handler({
      sourceKind: 'team-run',
      status: 'planned',
      limit: 5,
    });

    expect(listRuns).toHaveBeenCalledWith({
      sourceKind: 'team-run',
      status: 'planned',
      limit: 5,
    });
    expect(result).toMatchObject({
      structuredContent: {
        object: 'list',
        count: 1,
        data: [
          {
            runId: 'runtime_recent_mcp_1',
            sourceKind: 'team-run',
            teamRunId: 'runtime_recent_mcp_1',
            taskRunSpecId: 'task_spec_recent_mcp_1',
            status: 'planned',
            serviceIds: ['chatgpt'],
            runtimeProfileIds: ['default'],
            stepCount: 1,
          },
        ],
      },
    });
  });

  it('defaults to a bounded recent-run list', async () => {
    const listRuns = vi.fn(async () => []);
    const handler = createRuntimeRunsRecentToolHandler({
      control: {
        listRuns,
      },
    });

    const result = await handler({});

    expect(listRuns).toHaveBeenCalledWith({
      limit: 25,
      status: undefined,
      sourceKind: undefined,
    });
    expect(result.structuredContent).toEqual({
      object: 'list',
      data: [],
      count: 0,
    });
  });
});
