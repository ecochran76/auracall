import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  assertApiOpsBrowserStatus,
  readApiOpsBrowserStatusForCli,
} from '../../cli/apiOpsBrowserCommand.js';
import { API_STATUS_LIVE_FOLLOW_SEVERITIES } from '../../cli/apiStatusCommand.js';

const apiOpsBrowserStatusInputShape = {
  host: z.string().min(1).optional(),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
  expectedLiveFollowSeverity: z.enum(API_STATUS_LIVE_FOLLOW_SEVERITIES).optional(),
  expectedCompletionPaused: z.number().int().nonnegative().optional(),
  expectedCompletionActive: z.number().int().nonnegative().optional(),
} satisfies z.ZodRawShape;

const apiOpsBrowserDashboardShape = z.object({
  route: z.literal('/ops/browser'),
  hasMirrorLiveFollowPanel: z.boolean(),
  hasLiveFollowTargetsPanel: z.boolean(),
  hasLiveFollowTargetTable: z.boolean(),
  hasActiveCompletionTable: z.boolean(),
  hasCompletionInspectAction: z.boolean(),
  hasCompletionIdFillControl: z.boolean(),
  hasInlineCompletionActionControls: z.boolean(),
  hasStateAwareCompletionActions: z.boolean(),
  hasControlFeedbackNotice: z.boolean(),
  usesStatusControlPath: z.boolean(),
  usesAccountMirrorCompletionPayload: z.boolean(),
  hasPauseBinding: z.boolean(),
  hasResumeBinding: z.boolean(),
  hasCancelBinding: z.boolean(),
});

const apiOpsBrowserStatusOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  dashboard: apiOpsBrowserDashboardShape,
  status: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterApiOpsBrowserStatusToolDeps {
  fetchImpl?: typeof fetch;
}

export function registerApiOpsBrowserStatusTool(
  server: McpServer,
  deps: RegisterApiOpsBrowserStatusToolDeps = {},
): void {
  server.registerTool(
    'api_ops_browser_status',
    {
      title: 'Read Aura-Call ops browser status',
      description:
        'Read /ops/browser plus linked /status and assert the dashboard Mirror Live Follow control contract without launching browsers or provider work.',
      inputSchema: apiOpsBrowserStatusInputShape,
      outputSchema: apiOpsBrowserStatusOutputShape,
    },
    createApiOpsBrowserStatusToolHandler(deps),
  );
}

export function createApiOpsBrowserStatusToolHandler(
  deps: RegisterApiOpsBrowserStatusToolDeps = {},
) {
  return async (rawInput: unknown) => {
    const payload = z.object(apiOpsBrowserStatusInputShape).parse(rawInput);
    const summary = await readApiOpsBrowserStatusForCli({
      host: payload.host,
      port: payload.port,
      timeoutMs: payload.timeoutMs,
    }, deps.fetchImpl);
    assertApiOpsBrowserStatus(summary, {
      expectedSeverity: payload.expectedLiveFollowSeverity,
      expectedPaused: payload.expectedCompletionPaused,
      expectedActive: payload.expectedCompletionActive,
    });
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: `AuraCall ops browser ${summary.host}:${summary.port} is ok; dashboard completion controls use /status; ${summary.status.liveFollow.line}`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
