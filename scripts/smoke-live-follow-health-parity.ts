#!/usr/bin/env tsx
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import type {
  AccountMirrorSchedulerPassHistory,
  AccountMirrorSchedulerPassLedger,
} from '../src/accountMirror/schedulerLedger.js';
import type { AccountMirrorSchedulerPassResult } from '../src/accountMirror/schedulerService.js';
import type {
  AccountMirrorCompletionListRequest,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionStartRequest,
  AccountMirrorCompletionControlRequest,
} from '../src/accountMirror/completionService.js';
import { formatApiStatusCliSummary, readApiStatusForCli } from '../src/cli/apiStatusCommand.js';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';
import type { LiveFollowHealthSummary } from '../src/status/liveFollowHealth.js';

const expectedSeverity = 'paused';
const expectedOwner = 'media-generation:chatgpt:image';
const expectedRemaining = 4;

const yieldedPass: AccountMirrorSchedulerPassResult = {
  object: 'account_mirror_scheduler_pass',
  mode: 'execute',
  action: 'refresh-completed',
  startedAt: '2026-05-01T12:00:00.000Z',
  completedAt: '2026-05-01T12:00:05.000Z',
  selectedTarget: {
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    status: 'eligible',
    reason: 'eligible',
    eligibleAt: '2026-05-01T12:00:00.000Z',
    mirrorCompleteness: {
      state: 'in_progress',
      summary: 'Attachment inventory has 4 detail surfaces remaining.',
      remainingDetailSurfaces: {
        projects: 1,
        conversations: 3,
        total: expectedRemaining,
      },
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: true,
        attachmentCursorPresent: true,
      },
    },
  },
  backpressure: {
    reason: 'yielded-to-queued-work',
    message: 'Mirror refresh yielded because browser work queued behind it.',
  },
  metrics: {
    totalTargets: 1,
    eligibleTargets: 1,
    delayedTargets: 0,
    blockedTargets: 0,
    defaultChatgptEligibleTargets: 1,
    defaultChatgptDelayedTargets: 0,
    inProgressEligibleTargets: 1,
  },
  refresh: {
    object: 'account_mirror_refresh',
    requestId: 'smoke_live_follow_health_1',
    status: 'completed',
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    startedAt: '2026-05-01T12:00:00.000Z',
    completedAt: '2026-05-01T12:00:05.000Z',
    dispatcher: {
      key: 'managed-profile:/tmp/auracall-default-chatgpt::service:chatgpt',
      operationId: 'op_live_follow_health_1',
      blockedBy: null,
    },
    metadataCounts: {
      projects: 2,
      conversations: 6,
      artifacts: 0,
      files: 1,
      media: 0,
    },
    metadataEvidence: {
      identitySource: 'profile-menu',
      projectSampleIds: [],
      conversationSampleIds: [],
      attachmentInventory: {
        nextProjectIndex: 1,
        nextConversationIndex: 3,
        detailReadLimit: 6,
        scannedProjects: 1,
        scannedConversations: 3,
        yielded: true,
        yieldCause: {
          observedAt: '2026-05-01T12:00:04.500Z',
          ownerCommand: expectedOwner,
          kind: 'media-generation',
          operationClass: 'exclusive-mutating',
        },
      },
      truncated: {
        projects: false,
        conversations: false,
        artifacts: true,
      },
    },
    mirrorCompleteness: {
      state: 'in_progress',
      summary: 'Attachment inventory has 4 detail surfaces remaining.',
      remainingDetailSurfaces: {
        projects: 1,
        conversations: 3,
        total: expectedRemaining,
      },
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: true,
        attachmentCursorPresent: true,
      },
    },
    detectedIdentityKey: 'ecochran76@gmail.com',
    detectedAccountLevel: 'Business',
    mirrorStatus: {
      object: 'account_mirror_status',
      generatedAt: '2026-05-01T12:00:05.000Z',
      metrics: {
        total: 1,
        eligible: 1,
        delayed: 0,
        blocked: 0,
      },
      entries: [],
    },
  },
  error: null,
};

const pausedCompletion: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_health_parity',
  provider: 'chatgpt',
  runtimeProfileId: 'default',
  mode: 'live_follow',
  phase: 'steady_follow',
  status: 'paused',
  startedAt: '2026-05-01T12:00:10.000Z',
  completedAt: null,
  nextAttemptAt: '2026-05-01T12:10:00.000Z',
  maxPasses: null,
  passCount: 5,
  lastRefresh: null,
  mirrorCompleteness: {
    state: 'complete',
    summary: 'Smoke mirror is complete.',
    remainingDetailSurfaces: {
      projects: 0,
      conversations: 0,
      total: 0,
    },
    signals: {
      projectsTruncated: false,
      conversationsTruncated: false,
      attachmentInventoryTruncated: false,
      attachmentCursorPresent: false,
    },
  },
  error: null,
};

function createMemorySchedulerLedger(pass: AccountMirrorSchedulerPassResult): AccountMirrorSchedulerPassLedger {
  const entries = [pass];
  const readHistory = async (): Promise<AccountMirrorSchedulerPassHistory> => ({
    object: 'account_mirror_scheduler_pass_history',
    version: 1,
    updatedAt: entries[0]?.completedAt ?? null,
    limit: 50,
    entries,
  });
  return {
    async appendPass(nextPass) {
      entries.unshift(nextPass);
      return readHistory();
    },
    readHistory,
  };
}

function createInjectedCompletionService(): AccountMirrorCompletionService {
  return {
    start(_request: AccountMirrorCompletionStartRequest = {}) {
      throw new Error('live-follow parity smoke must not start provider work');
    },
    read(id: string) {
      return id === pausedCompletion.id ? pausedCompletion : null;
    },
    list(request: AccountMirrorCompletionListRequest = {}) {
      if (request.provider && request.provider !== pausedCompletion.provider) return [];
      if (request.runtimeProfileId && request.runtimeProfileId !== pausedCompletion.runtimeProfileId) return [];
      if (request.status && request.status !== 'active' && request.status !== pausedCompletion.status) return [];
      if (request.activeOnly === true && !['queued', 'running', 'paused'].includes(pausedCompletion.status)) return [];
      return [pausedCompletion];
    },
    control(_request: AccountMirrorCompletionControlRequest) {
      throw new Error('live-follow parity smoke must not control provider work');
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text}`);
  }
  return text;
}

async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  return JSON.parse(text) as T;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: expected text to include ${expected}.`);
  }
}

function assertLiveFollow(summary: LiveFollowHealthSummary, label: string): void {
  assertEqual(summary.severity, expectedSeverity, `${label} severity`);
  assertEqual(summary.pausedCompletions, 1, `${label} paused completions`);
  assertEqual(summary.latestYield?.queuedOwnerCommand, expectedOwner, `${label} latest yield owner`);
  assertEqual(summary.latestYield?.remainingDetailSurfaces, expectedRemaining, `${label} latest yield remaining`);
}

async function main(): Promise<void> {
  const server = await createResponsesHttpServer(
    {
      host: '127.0.0.1',
      port: 0,
      accountMirrorSchedulerIntervalMs: 60_000,
    },
    {
      accountMirrorSchedulerLedger: createMemorySchedulerLedger(yieldedPass),
      accountMirrorCompletionService: createInjectedCompletionService(),
    },
  );
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const httpStatus = await fetchJson<{ liveFollow: LiveFollowHealthSummary }>(`${baseUrl}/status`);
    assertLiveFollow(httpStatus.liveFollow, 'HTTP /status.liveFollow');

    const cliSummary = await readApiStatusForCli({ port: server.port });
    assertLiveFollow(cliSummary.liveFollow, 'CLI api status');
    assertIncludes(
      formatApiStatusCliSummary(cliSummary),
      'Live follow health: severity=paused',
      'CLI formatted status',
    );

    const mcpResult = await createApiStatusToolHandler()({
      port: server.port,
      expectedLiveFollowSeverity: expectedSeverity,
      expectedCompletionPaused: 1,
    });
    if (mcpResult.isError) throw new Error('MCP api_status returned an error result.');
    const mcpStructured = mcpResult.structuredContent as { liveFollow: LiveFollowHealthSummary };
    assertLiveFollow(mcpStructured.liveFollow, 'MCP api_status');

    const dashboard = await fetchText(`${baseUrl}/ops/browser`);
    assertIncludes(dashboard, 'Live Follow Severity', 'dashboard label');
    assertIncludes(dashboard, 'status.liveFollow', 'dashboard shared status projection');
    assertIncludes(dashboard, 'severity-paused', 'dashboard severity class');

    console.log([
      `live-follow-health parity smoke: pass port=${server.port}`,
      `severity=${httpStatus.liveFollow.severity}`,
      `paused=${httpStatus.liveFollow.pausedCompletions ?? 'unknown'}`,
      `latestYield.owner=${httpStatus.liveFollow.latestYield?.queuedOwnerCommand ?? 'unknown'}`,
      `latestYield.remaining=${httpStatus.liveFollow.latestYield?.remainingDetailSurfaces ?? 'unknown'}`,
      'providerWork=none',
    ].join('\n'));
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
