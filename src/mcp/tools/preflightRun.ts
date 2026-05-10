import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readApiPreflightRunForCli } from '../../cli/apiPreflightRunCommand.js';

const preflightRunStepShape = z.object({
  label: z.string(),
  status: z.enum(['running', 'passed', 'failed']),
  command: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

const preflightRunShape = z.object({
  object: z.literal('auracall_preflight_run'),
  id: z.string(),
  name: z.literal('lazy-live-follow'),
  status: z.enum(['queued', 'running', 'passed', 'failed']),
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string(),
  logPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  errorMessage: z.string().nullable(),
  steps: z.array(preflightRunStepShape),
});

const preflightRunInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const preflightRunOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  run: preflightRunShape,
} satisfies z.ZodRawShape;

export interface RegisterPreflightRunToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerPreflightRunTool(
  server: McpServer,
  deps: RegisterPreflightRunToolDeps = {},
): void {
  server.registerTool(
    'preflight_run',
    {
      title: 'Read AuraCall preflight run',
      description:
        'Read one lazy-live-follow preflight run, including structured step progress, from the local AuraCall API.',
      inputSchema: preflightRunInputShape,
      outputSchema: preflightRunOutputShape,
    },
    createPreflightRunToolHandler(deps),
  );
}

export function createPreflightRunToolHandler(deps: RegisterPreflightRunToolDeps = {}) {
  return async (rawInput: unknown) => {
    const payload = z.object(preflightRunInputShape).parse(rawInput);
    const summary = await readApiPreflightRunForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
      id: payload.id,
    }, deps.fetchImpl);
    const run = summary.run;
    const activeStep = run.steps.find((step) => step.status === 'running');
    const latestStep = activeStep ?? run.steps.at(-1) ?? null;
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `AuraCall preflight run ${run.id}: status=${run.status}; steps=${run.steps.length}; ` +
            `latest=${latestStep ? `${latestStep.label}/${latestStep.status}` : 'none'}; log=${run.logPath}`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
