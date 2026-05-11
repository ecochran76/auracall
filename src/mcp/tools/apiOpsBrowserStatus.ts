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
  hasApiServiceControls: z.boolean(),
  hasApiLogTailControl: z.boolean(),
  hasRecentServiceEventsPanel: z.boolean(),
  hasRecentServiceEventActions: z.boolean(),
  hasRecentServiceEventFilters: z.boolean(),
  hasRecentServiceEventSchedulerDetail: z.boolean(),
  hasRecentServiceEventPersistence: z.boolean(),
  hasPreflightStatusPanel: z.boolean(),
  hasPreflightRunControl: z.boolean(),
  hasPreflightRunHistoryPanel: z.boolean(),
  hasPreflightStepProgress: z.boolean(),
  hasPreflightRunLogControl: z.boolean(),
  hasMirrorLiveFollowPanel: z.boolean(),
  hasMirrorSchedulerExplanation: z.boolean(),
  hasMirrorSchedulerWaitTable: z.boolean(),
  hasMirrorSchedulerWaitActions: z.boolean(),
  hasMirrorSchedulerCompletionDetail: z.boolean(),
  hasMirrorSchedulerDiagnosticsBundle: z.boolean(),
  hasLiveFollowTargetsPanel: z.boolean(),
  hasAttentionQueue: z.boolean(),
  hasLiveFollowTargetTable: z.boolean(),
  hasActiveCompletionTable: z.boolean(),
  hasCompletionInspectAction: z.boolean(),
  hasCompletionInputInspectControl: z.boolean(),
  hasCompletionIdFillControl: z.boolean(),
  hasInlineCompletionActionControls: z.boolean(),
  hasStateAwareCompletionActions: z.boolean(),
  hasControlFeedbackNotice: z.boolean(),
  usesStatusControlPath: z.boolean(),
  usesAccountMirrorCompletionPayload: z.boolean(),
  hasPauseBinding: z.boolean(),
  hasResumeBinding: z.boolean(),
  hasCancelBinding: z.boolean(),
}).catchall(z.boolean());

const apiOpsBrowserServiceDiscoveryShape = z.object({
  localBaseUrl: z.string().optional(),
  externalBaseUrl: z.string().optional(),
  proxyTarget: z.string().optional(),
  auth: z.string().optional(),
});

const apiOpsBrowserStatusOutputShape = {
  host: z.string(),
  port: z.number().int().positive(),
  dashboardUrl: z.string(),
  serviceDiscovery: apiOpsBrowserServiceDiscoveryShape,
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
          text: `AuraCall ops browser ${summary.host}:${summary.port} is ok; dashboard=${summary.dashboardUrl}; apiService=${summary.dashboard.hasApiServiceControls ? 'ok' : 'missing'}; apiLogTail=${summary.dashboard.hasApiLogTailControl ? 'ok' : 'missing'}; recentEvents=${summary.dashboard.hasRecentServiceEventsPanel ? 'ok' : 'missing'}; recentEventFilters=${summary.dashboard.hasRecentServiceEventFilters ? 'ok' : 'missing'}; recentSchedulerDetail=${summary.dashboard.hasRecentServiceEventSchedulerDetail ? 'ok' : 'missing'}; recentEventPersistence=${summary.dashboard.hasRecentServiceEventPersistence ? 'ok' : 'missing'}; schedulerWhy=${summary.dashboard.hasMirrorSchedulerExplanation ? 'ok' : 'missing'}; schedulerForeground=${summary.dashboard.hasMirrorSchedulerForegroundWork ? 'ok' : 'missing'}; schedulerWaitTable=${summary.dashboard.hasMirrorSchedulerWaitTable ? 'ok' : 'missing'}; schedulerWaitActions=${summary.dashboard.hasMirrorSchedulerWaitActions ? 'ok' : 'missing'}; schedulerCompletionDetail=${summary.dashboard.hasMirrorSchedulerCompletionDetail ? 'ok' : 'missing'}; schedulerDiagnostics=${summary.dashboard.hasMirrorSchedulerDiagnosticsBundle ? 'ok' : 'missing'}; preflight=${summary.dashboard.hasPreflightStatusPanel ? 'ok' : 'missing'}; preflightRun=${summary.dashboard.hasPreflightRunControl ? 'ok' : 'missing'}; preflightHistory=${summary.dashboard.hasPreflightRunHistoryPanel ? 'ok' : 'missing'}; preflightSteps=${summary.dashboard.hasPreflightStepProgress ? 'ok' : 'missing'}; preflightLog=${summary.dashboard.hasPreflightRunLogControl ? 'ok' : 'missing'}; dashboard completion controls use /status; ${summary.status.liveFollow.line}`,
        },
      ],
      structuredContent: summary as typeof summary & Record<string, unknown>,
    };
  };
}
