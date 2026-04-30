import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  API_STATUS_ACCOUNT_MIRROR_POSTURES,
  API_STATUS_BACKPRESSURE_REASONS,
  assertApiStatusBackpressure,
  assertApiStatusSchedulerPosture,
  readApiStatusForCli,
} from '../../cli/apiStatusCommand.js';

const apiStatusInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  expectedAccountMirrorPosture: z.enum(API_STATUS_ACCOUNT_MIRROR_POSTURES).optional(),
  expectedAccountMirrorBackpressure: z.enum(API_STATUS_BACKPRESSURE_REASONS).optional(),
} satisfies z.ZodRawShape;

const apiStatusBackpressureShape = z.object({
  reason: z.enum([...API_STATUS_BACKPRESSURE_REASONS, 'unknown']),
  message: z.string().nullable(),
});

const apiStatusOperatorStatusShape = z.object({
  posture: z.enum([...API_STATUS_ACCOUNT_MIRROR_POSTURES, 'unknown']),
  reason: z.string().nullable(),
  backpressureReason: z.string().nullable(),
});

const apiStatusOutputShape = {
  ok: z.boolean().nullable(),
  host: z.string(),
  port: z.number().int().positive(),
  scheduler: z.object({
    enabled: z.boolean().nullable(),
    state: z.string().nullable(),
    dryRun: z.boolean().nullable(),
    lastWakeReason: z.string().nullable(),
    lastWakeAt: z.string().nullable(),
    lastAction: z.string().nullable(),
    operatorStatus: apiStatusOperatorStatusShape,
    backpressure: apiStatusBackpressureShape,
  }),
  raw: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterApiStatusToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerApiStatusTool(
  server: McpServer,
  deps: RegisterApiStatusToolDeps = {},
): void {
  server.registerTool(
    'api_status',
    {
      title: 'Read Aura-Call API status',
      description:
        'Read the local Aura-Call API /status summary, including compact lazy mirror scheduler posture, without launching browsers or provider work.',
      inputSchema: apiStatusInputShape,
      outputSchema: apiStatusOutputShape,
    },
    createApiStatusToolHandler(deps),
  );
}

export function createApiStatusToolHandler(deps: RegisterApiStatusToolDeps = {}) {
  return async (rawInput: unknown) => {
    const payload = z.object(apiStatusInputShape).parse(rawInput);
    const summary = await readApiStatusForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
    }, deps.fetchImpl);
    assertApiStatusBackpressure(summary, {
      expectedReason: payload.expectedAccountMirrorBackpressure,
    });
    assertApiStatusSchedulerPosture(summary, {
      expectedPosture: payload.expectedAccountMirrorPosture,
    });
    const posture = summary.scheduler.operatorStatus.posture;
    const state = summary.scheduler.state ?? 'unknown';
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall API ${summary.host}:${summary.port} is ${summary.ok === false ? 'not-ok' : summary.ok === true ? 'ok' : 'unknown'}; mirror posture ${posture}; scheduler state ${state}.`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
