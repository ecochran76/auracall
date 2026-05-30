import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AccountMirrorArtifactRecoveryPlanner } from '../../accountMirror/artifactRecoveryPlanner.js';

const recoveryCandidateInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfileId: z.string().min(1).optional(),
  tenantKey: z.string().min(1).optional(),
  status: z.enum(['eligible', 'needs_detail_refresh', 'deferred', 'blocked', 'unsupported', 'terminal']).optional(),
  action: z.enum([
    'queue_history_materialization',
    'refresh_detail_inventory',
    'start_materialization_policy_completion',
    'inspect_archive_materialization',
    'none',
  ]).optional(),
  includeSearchRows: z.boolean().optional(),
  limit: z.number().int().nonnegative().max(500).optional(),
} satisfies z.ZodRawShape;

const recoveryCandidateOutputShape = {
  object: z.literal('account_mirror_artifact_recovery_plan'),
  generatedAt: z.string(),
  query: z.unknown(),
  candidates: z.array(z.unknown()),
  omitted: z.object({
    candidates: z.number(),
  }),
  metrics: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorRecoveryToolDeps {
  planner: AccountMirrorArtifactRecoveryPlanner;
}

export function registerAccountMirrorRecoveryTool(
  server: McpServer,
  deps: RegisterAccountMirrorRecoveryToolDeps,
): void {
  server.registerTool(
    'account_mirror_recovery_candidates',
    {
      title: 'Plan account mirror artifact recovery',
      description:
        'Read bounded account mirror artifact recovery candidates without launching provider browser work.',
      inputSchema: recoveryCandidateInputShape,
      outputSchema: recoveryCandidateOutputShape,
    },
    createAccountMirrorRecoveryCandidatesToolHandler(deps),
  );
}

export function createAccountMirrorRecoveryCandidatesToolHandler(input: {
  planner: AccountMirrorArtifactRecoveryPlanner;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(recoveryCandidateInputShape).parse(rawInput);
    const result = await input.planner.plan(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Account mirror recovery candidates: ${result.metrics.returned}/${result.metrics.total}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}
