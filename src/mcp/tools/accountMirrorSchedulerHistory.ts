import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  readApiSchedulerHistoryForCli,
} from '../../cli/apiSchedulerHistoryCommand.js';

const accountMirrorSchedulerHistoryInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(50).optional(),
} satisfies z.ZodRawShape;

const schedulerHistoryOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  history: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorSchedulerHistoryToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerAccountMirrorSchedulerHistoryTool(
  server: McpServer,
  deps: RegisterAccountMirrorSchedulerHistoryToolDeps = {},
): void {
  server.registerTool(
    'account_mirror_scheduler_history',
    {
      title: 'Read account mirror scheduler history',
      description:
        'Read compact lazy account mirror scheduler history from the running Aura-Call API without launching browsers or provider work.',
      inputSchema: accountMirrorSchedulerHistoryInputShape,
      outputSchema: schedulerHistoryOutputShape,
    },
    createAccountMirrorSchedulerHistoryToolHandler(deps),
  );
}

export function createAccountMirrorSchedulerHistoryToolHandler(
  deps: RegisterAccountMirrorSchedulerHistoryToolDeps = {},
) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorSchedulerHistoryInputShape).parse(rawInput);
    const summary = await readApiSchedulerHistoryForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
      limit: payload.limit,
    }, deps.fetchImpl);
    const history = isRecord(summary.history) ? summary.history : {};
    const entries = Array.isArray(history.entries) ? history.entries : [];
    const latestYield = isRecord(history.latestYield) ? 'present' : 'none';
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `Account mirror scheduler history: ${entries.length} entries; ` +
            `latest yield ${latestYield}.`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
