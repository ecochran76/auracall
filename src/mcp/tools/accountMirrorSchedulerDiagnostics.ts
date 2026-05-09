import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  readApiSchedulerDiagnosticsForCli,
} from '../../cli/apiSchedulerDiagnosticsCommand.js';

const accountMirrorSchedulerDiagnosticsInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  completionId: z.string().min(1).optional(),
} satisfies z.ZodRawShape;

const schedulerDiagnosticsOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  diagnostics: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorSchedulerDiagnosticsToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerAccountMirrorSchedulerDiagnosticsTool(
  server: McpServer,
  deps: RegisterAccountMirrorSchedulerDiagnosticsToolDeps = {},
): void {
  server.registerTool(
    'account_mirror_scheduler_diagnostics',
    {
      title: 'Read account mirror scheduler diagnostics',
      description:
        'Read the same compact lazy account mirror scheduler diagnostics bundle exposed in the AuraCall operator dashboard.',
      inputSchema: accountMirrorSchedulerDiagnosticsInputShape,
      outputSchema: schedulerDiagnosticsOutputShape,
    },
    createAccountMirrorSchedulerDiagnosticsToolHandler(deps),
  );
}

export function createAccountMirrorSchedulerDiagnosticsToolHandler(
  deps: RegisterAccountMirrorSchedulerDiagnosticsToolDeps = {},
) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorSchedulerDiagnosticsInputShape).parse(rawInput);
    const summary = await readApiSchedulerDiagnosticsForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
      provider: payload.provider,
      runtimeProfile: payload.runtimeProfile,
      completionId: payload.completionId,
    }, deps.fetchImpl);
    const diagnostics = isRecord(summary.diagnostics) ? summary.diagnostics : {};
    const target = isRecord(diagnostics.target) ? diagnostics.target : {};
    const wait = isRecord(diagnostics.wait) ? diagnostics.wait : {};
    const completion = isRecord(diagnostics.completion) ? diagnostics.completion : null;
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `Account mirror scheduler diagnostics: ` +
            `${readString(target.provider) ?? 'unknown'}/${readString(target.runtimeProfileId) ?? 'unknown'} ` +
            `wait=${readString(wait.label) ?? readString(wait.kind) ?? 'unknown'} ` +
            `completion=${completion ? readString(completion.id) ?? 'unknown' : 'none'}.`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
