import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../../src/runtime/stepOutputContract.js';
import { createTaskRunSpec } from '../../src/teams/model.js';

const executeConfiguredTeamRun = vi.fn();
const resolveConfig = vi.fn();

vi.mock('../../src/cli/teamRunCommand.js', () => ({
  executeConfiguredTeamRun,
}));

vi.mock('../../src/schema/resolver.js', () => ({
  resolveConfig,
}));

const { registerTeamRunTool } = await import('../../src/mcp/tools/teamRun.js');

describe('team_run MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('registers a bounded team-run write tool with MCP provenance', async () => {
    resolveConfig.mockResolvedValue({
      teams: {
        ops: { agents: ['analyst'] },
      },
    });
    executeConfiguredTeamRun.mockResolvedValue({
      taskRunSpec: {
        id: 'taskrun_ops_mcp1',
        teamId: 'ops',
        trigger: 'mcp',
        requestedBy: {
          kind: 'mcp',
          label: 'auracall-mcp team_run',
        },
      },
      payload: {
        teamId: 'ops',
        taskRunSpecId: 'taskrun_ops_mcp1',
        teamRunId: 'teamrun_ops_mcp1',
        runtimeRunId: 'teamrun_ops_mcp1',
        runtimeSourceKind: 'team-run',
        runtimeRunStatus: 'succeeded',
        runtimeUpdatedAt: '2026-04-21T20:00:00.000Z',
        terminalStepCount: 1,
        finalOutputSummary: 'mcp-created team run completed',
        sharedStateStatus: 'succeeded',
        sharedStateNotes: [],
        stepSummaries: [],
      },
    });

    const registeredTools: Array<{
      name: string;
      config: { inputSchema?: unknown; outputSchema?: unknown };
      handler: (input: unknown) => Promise<unknown>;
    }> = [];
    const server = {
      registerTool(name: string, config: { inputSchema?: unknown; outputSchema?: unknown }, handler: (input: unknown) => Promise<unknown>) {
        registeredTools.push({ name, config, handler });
      },
    };

    registerTeamRunTool(server as never);

    const registered = registeredTools[0];
    expect(registered?.name).toBe('team_run');
    expect(registered?.config.inputSchema).toBeDefined();
    expect(registered?.config.outputSchema).toBeDefined();

    const result = await registered.handler({
      teamId: 'ops',
      objective: 'Produce one MCP-created team result.',
      outputContract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
      maxTurns: 2,
    }) as {
      structuredContent: {
        object: string;
        taskRunSpec: { id: string; trigger: string; requestedBy: { kind: string; label: string } };
        execution: { teamRunId: string; runtimeRunStatus: string; finalOutputSummary: string };
      };
    };

    expect(executeConfiguredTeamRun).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'ops',
      objective: 'Produce one MCP-created team result.',
      outputContract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
      maxTurns: 2,
      contextCommand: 'auracall-mcp team_run',
      requestedBy: {
        kind: 'mcp',
        label: 'auracall-mcp team_run',
      },
      trigger: 'mcp',
      executionRequestedBy: 'auracall-mcp team_run',
    }));
    expect(result.structuredContent).toMatchObject({
      object: 'team_run',
      taskRunSpec: {
        id: 'taskrun_ops_mcp1',
        trigger: 'mcp',
        requestedBy: {
          kind: 'mcp',
          label: 'auracall-mcp team_run',
        },
      },
      execution: {
        teamRunId: 'teamrun_ops_mcp1',
        runtimeRunStatus: 'succeeded',
        finalOutputSummary: 'mcp-created team run completed',
      },
    });
  });

  test('passes a prebuilt flattened taskRunSpec without MCP provenance replacement', async () => {
    const taskRunSpec = createTaskRunSpec({
      id: 'taskrun_ops_mcp_prebuilt',
      teamId: 'ops',
      title: 'Prebuilt MCP task spec',
      objective: 'Produce one prebuilt MCP team result.',
      createdAt: '2026-04-21T21:00:00.000Z',
      requestedBy: {
        kind: 'mcp',
        label: 'external mcp spec author',
      },
      trigger: 'mcp',
    });
    resolveConfig.mockResolvedValue({
      teams: {
        ops: { agents: ['analyst'] },
      },
    });
    executeConfiguredTeamRun.mockResolvedValue({
      taskRunSpec,
      payload: {
        teamId: 'ops',
        taskRunSpecId: 'taskrun_ops_mcp_prebuilt',
        teamRunId: 'teamrun_ops_mcp_prebuilt',
        runtimeRunId: 'teamrun_ops_mcp_prebuilt',
        runtimeSourceKind: 'team-run',
        runtimeRunStatus: 'succeeded',
        runtimeUpdatedAt: '2026-04-21T21:00:00.000Z',
        terminalStepCount: 1,
        finalOutputSummary: 'prebuilt mcp team run completed',
        sharedStateStatus: 'succeeded',
        sharedStateNotes: [],
        stepSummaries: [],
      },
    });

    const registeredTools: Array<{
      name: string;
      config: { inputSchema?: unknown; outputSchema?: unknown };
      handler: (input: unknown) => Promise<unknown>;
    }> = [];
    const server = {
      registerTool(name: string, config: { inputSchema?: unknown; outputSchema?: unknown }, handler: (input: unknown) => Promise<unknown>) {
        registeredTools.push({ name, config, handler });
      },
    };

    registerTeamRunTool(server as never);
    const registered = registeredTools[0];
    const result = await registered.handler({
      teamId: 'ops',
      taskRunSpec,
    }) as {
      structuredContent: {
        taskRunSpec: { id: string; requestedBy: { label: string } };
        execution: { runtimeRunStatus: string; finalOutputSummary: string };
      };
    };

    expect(executeConfiguredTeamRun).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'ops',
      objective: 'Produce one prebuilt MCP team result.',
      taskRunSpec,
      contextCommand: undefined,
      requestedBy: undefined,
      trigger: undefined,
      executionRequestedBy: undefined,
    }));
    expect(result.structuredContent).toMatchObject({
      taskRunSpec: {
        id: 'taskrun_ops_mcp_prebuilt',
        requestedBy: {
          label: 'external mcp spec author',
        },
      },
      execution: {
        runtimeRunStatus: 'succeeded',
        finalOutputSummary: 'prebuilt mcp team run completed',
      },
    });
  });
});
