#!/usr/bin/env tsx
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import type {
  AccountMirrorSchedulerPassHistory,
  AccountMirrorSchedulerPassLedger,
} from '../src/accountMirror/schedulerLedger.js';
import type { AccountMirrorSchedulerPassResult } from '../src/accountMirror/schedulerService.js';
import { readApiStatusForCli } from '../src/cli/apiStatusCommand.js';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';

const yieldedPass: AccountMirrorSchedulerPassResult = {
  object: 'account_mirror_scheduler_pass',
  mode: 'execute',
  action: 'refresh-completed',
  startedAt: '2026-04-30T12:00:00.000Z',
  completedAt: '2026-04-30T12:00:05.000Z',
  selectedTarget: {
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    status: 'eligible',
    reason: 'eligible',
    eligibleAt: '2026-04-30T12:00:00.000Z',
    mirrorCompleteness: {
      state: 'in_progress',
      summary: 'Attachment inventory has 4 detail surfaces remaining.',
      remainingDetailSurfaces: {
        projects: 1,
        conversations: 3,
        total: 4,
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
    message: 'Mirror refresh yielded between detail reads because browser work queued behind it.',
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
    requestId: 'smoke_yield_1',
    status: 'completed',
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId: 'default',
    startedAt: '2026-04-30T12:00:00.000Z',
    completedAt: '2026-04-30T12:00:05.000Z',
    dispatcher: {
      key: 'managed-profile:/tmp/auracall-default-chatgpt::service:chatgpt',
      operationId: 'op_smoke_mirror_1',
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
          observedAt: '2026-04-30T12:00:04.500Z',
          ownerCommand: 'media-generation:chatgpt:image',
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
        total: 4,
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
      generatedAt: '2026-04-30T12:00:05.000Z',
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return await response.json() as T;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function main(): Promise<void> {
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { accountMirrorSchedulerLedger: createMemorySchedulerLedger(yieldedPass) },
  );
  try {
    const history = await fetchJson<{
      latestYield?: {
        queuedWork?: { ownerCommand?: string | null };
        remainingDetailSurfaces?: { total?: number | null };
        resumeCursor?: { nextConversationIndex?: number | null };
      } | null;
    }>(`http://127.0.0.1:${server.port}/v1/account-mirrors/scheduler/history`);
    assertEqual(history.latestYield?.queuedWork?.ownerCommand, 'media-generation:chatgpt:image', 'history latest yield owner');
    assertEqual(history.latestYield?.remainingDetailSurfaces?.total, 4, 'history latest yield remaining surfaces');
    assertEqual(history.latestYield?.resumeCursor?.nextConversationIndex, 3, 'history latest yield resume cursor');

    const cliSummary = await readApiStatusForCli({ port: server.port });
    assertEqual(cliSummary.scheduler.latestYield?.queuedOwnerCommand, 'media-generation:chatgpt:image', 'CLI latest yield owner');
    assertEqual(cliSummary.scheduler.latestYield?.remainingDetailSurfaces, 4, 'CLI latest yield remaining surfaces');

    const mcpResult = await createApiStatusToolHandler()({
      port: server.port,
      expectedAccountMirrorPosture: 'disabled',
    });
    const structured = mcpResult.structuredContent as {
      scheduler?: {
        latestYield?: {
          queuedOwnerCommand?: string | null;
          remainingDetailSurfaces?: number | null;
        } | null;
      };
    };
    assertEqual(
      structured.scheduler?.latestYield?.queuedOwnerCommand,
      'media-generation:chatgpt:image',
      'MCP latest yield owner',
    );
    assertEqual(structured.scheduler?.latestYield?.remainingDetailSurfaces, 4, 'MCP latest yield remaining surfaces');

    console.log([
      `scheduler-history smoke: pass port=${server.port}`,
      `latestYield.owner=${history.latestYield?.queuedWork?.ownerCommand ?? 'unknown'}`,
      `latestYield.remaining=${history.latestYield?.remainingDetailSurfaces?.total ?? 'unknown'}`,
      `latestYield.nextConversationIndex=${history.latestYield?.resumeCursor?.nextConversationIndex ?? 'unknown'}`,
    ].join('\n'));
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
