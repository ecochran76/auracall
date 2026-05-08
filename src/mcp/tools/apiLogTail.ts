import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readApiLogTailForCli } from '../../cli/apiLogTailCommand.js';

const apiLogTailInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().max(262_144).optional(),
} satisfies z.ZodRawShape;

const apiLogTailOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  logTail: z.object({
    object: z.literal('api_log_tail'),
    logPath: z.string(),
    exists: z.boolean(),
    sizeBytes: z.number(),
    maxBytes: z.number(),
    truncated: z.boolean(),
    content: z.string(),
  }),
} satisfies z.ZodRawShape;

export interface RegisterApiLogTailToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerApiLogTailTool(
  server: McpServer,
  deps: RegisterApiLogTailToolDeps = {},
): void {
  server.registerTool(
    'api_log_tail',
    {
      title: 'Read Aura-Call API log tail',
      description:
        'Read the bounded local Aura-Call API service log tail without opening the dashboard or launching browsers.',
      inputSchema: apiLogTailInputShape,
      outputSchema: apiLogTailOutputShape,
    },
    createApiLogTailToolHandler(deps),
  );
}

export function createApiLogTailToolHandler(deps: RegisterApiLogTailToolDeps = {}) {
  return async (rawInput: unknown) => {
    const payload = z.object(apiLogTailInputShape).parse(rawInput);
    const summary = await readApiLogTailForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
      maxBytes: payload.maxBytes,
    }, deps.fetchImpl);
    const tail = summary.logTail;
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `AuraCall API log tail ${summary.host}:${summary.port}; ` +
            `exists=${tail.exists ? 'yes' : 'no'}; size=${tail.sizeBytes}; ` +
            `maxBytes=${tail.maxBytes}; truncated=${tail.truncated ? 'yes' : 'no'}; log=${tail.logPath}`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
