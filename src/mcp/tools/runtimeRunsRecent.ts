import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ExecutionRuntimeControlContract } from '../../runtime/contract.js';
import { createExecutionRuntimeControl } from '../../runtime/control.js';
import { summarizeExecutionRunListItem } from '../../runtime/runListSummary.js';

const runtimeRunsRecentInputShape = {
  limit: z.number().int().min(0).max(100).optional(),
  status: z.enum(['planned', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  sourceKind: z.enum(['team-run', 'direct']).optional(),
} satisfies z.ZodRawShape;

const runtimeRunListItemShape = z.object({
  runId: z.string(),
  sourceKind: z.enum(['team-run', 'direct']),
  teamRunId: z.string().nullable(),
  taskRunSpecId: z.string().nullable(),
  status: z.enum(['planned', 'running', 'succeeded', 'failed', 'cancelled']),
  createdAt: z.string(),
  updatedAt: z.string(),
  stepCount: z.number().int().nonnegative(),
  runnableStepCount: z.number().int().nonnegative(),
  runningStepCount: z.number().int().nonnegative(),
  serviceIds: z.array(z.string()),
  runtimeProfileIds: z.array(z.string()),
});

const runtimeRunsRecentOutputShape = {
  object: z.literal('list'),
  data: z.array(runtimeRunListItemShape),
  count: z.number().int().nonnegative(),
} satisfies z.ZodRawShape;

export function registerRuntimeRunsRecentTool(server: McpServer): void {
  server.registerTool(
    'runtime_runs_recent',
    {
      title: 'List recent Aura-Call runtime runs',
      description:
        'Read recent local runtime-run state with source/status/limit filters. This does not touch provider browsers.',
      inputSchema: runtimeRunsRecentInputShape,
      outputSchema: runtimeRunsRecentOutputShape,
    },
    createRuntimeRunsRecentToolHandler(),
  );
}

export interface RegisterRuntimeRunsRecentToolDeps {
  control?: Pick<ExecutionRuntimeControlContract, 'listRuns'>;
}

export function createRuntimeRunsRecentToolHandler(deps: RegisterRuntimeRunsRecentToolDeps = {}) {
  const control = deps.control ?? createExecutionRuntimeControl();
  return async (input: unknown) => {
    const payload = z.object(runtimeRunsRecentInputShape).parse(input);
    const records = await control.listRuns({
      limit: payload.limit ?? 25,
      status: payload.status,
      sourceKind: payload.sourceKind,
    });
    const data = records.map(summarizeExecutionRunListItem);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${data.length} recent runtime run${data.length === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: {
        object: 'list',
        data,
        count: data.length,
      },
    };
  };
}
