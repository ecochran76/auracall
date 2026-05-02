import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createAccountMirrorStatusRegistry,
  type AccountMirrorStatusRegistry,
} from '../../accountMirror/statusRegistry.js';
import { createAccountMirrorPersistence } from '../../accountMirror/cachePersistence.js';

const accountMirrorStatusInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  explicitRefresh: z.boolean().optional(),
} satisfies z.ZodRawShape;

const mirrorCompletenessShape = z.object({
  state: z.enum(['none', 'complete', 'in_progress', 'unknown']),
  summary: z.string(),
  remainingDetailSurfaces: z.object({
    projects: z.number(),
    conversations: z.number(),
    total: z.number(),
  }).nullable(),
  signals: z.object({
    projectsTruncated: z.boolean(),
    conversationsTruncated: z.boolean(),
    attachmentInventoryTruncated: z.boolean(),
    attachmentCursorPresent: z.boolean(),
  }),
});

const accountMirrorStatusEntryShape = z.object({
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfileId: z.string(),
  browserProfileId: z.string().nullable(),
  expectedIdentityKey: z.string().nullable(),
  detectedIdentityKey: z.string().nullable(),
  accountLevel: z.string().nullable(),
  status: z.enum(['eligible', 'delayed', 'blocked']),
  reason: z.string(),
  eligibleAt: z.string().nullable(),
  delayMs: z.number(),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastQueuedAt: z.string().nullable(),
  lastStartedAt: z.string().nullable(),
  lastCompletedAt: z.string().nullable(),
  consecutiveFailureCount: z.number(),
  mirrorState: z.object({
    queued: z.boolean(),
    running: z.boolean(),
    lastRefreshRequestId: z.string().nullable(),
    lastDispatcherKey: z.string().nullable(),
    lastDispatcherOperationId: z.string().nullable(),
    lastDispatcherBlockedBy: z.record(z.string(), z.unknown()).nullable(),
  }),
  metadataCounts: z.object({
    projects: z.number(),
    conversations: z.number(),
    artifacts: z.number(),
    files: z.number(),
    media: z.number(),
  }),
  metadataEvidence: z.object({
    identitySource: z.string().nullable(),
    projectSampleIds: z.array(z.string()),
    conversationSampleIds: z.array(z.string()),
    attachmentInventory: z.object({
      nextProjectIndex: z.number(),
      nextConversationIndex: z.number(),
      detailReadLimit: z.number(),
      scannedProjects: z.number(),
      scannedConversations: z.number(),
      yielded: z.boolean().optional(),
    }).nullable().optional(),
    truncated: z.object({
      projects: z.boolean(),
      conversations: z.boolean(),
      artifacts: z.boolean(),
    }),
  }).nullable(),
  mirrorCompleteness: mirrorCompletenessShape,
  liveFollow: z.object({
    configured: z.boolean(),
    enabled: z.boolean(),
    state: z.enum(['enabled', 'disabled', 'unconfigured', 'missing_identity', 'unsupported']),
    reason: z.string(),
    mode: z.string().nullable(),
    priority: z.string().nullable(),
  }),
  limits: z.object({
    minIntervalMs: z.number(),
    explicitRefreshMinIntervalMs: z.number(),
    jitterMs: z.number(),
    jitterMaxMs: z.number(),
    failureCooldownMs: z.number(),
    hardStopCooldownMs: z.number(),
    maxPageReadsPerCycle: z.number(),
    maxConversationRowsPerCycle: z.number(),
    maxArtifactRowsPerCycle: z.number(),
  }),
});

const accountMirrorStatusOutputShape = {
  object: z.literal('account_mirror_status'),
  generatedAt: z.string(),
  entries: z.array(accountMirrorStatusEntryShape),
  metrics: z.object({
    total: z.number(),
    eligible: z.number(),
    delayed: z.number(),
    blocked: z.number(),
  }),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorStatusToolDeps {
  registry?: AccountMirrorStatusRegistry;
  config?: Record<string, unknown> | null;
}

export function registerAccountMirrorStatusTool(
  server: McpServer,
  deps: RegisterAccountMirrorStatusToolDeps = {},
): void {
  const persistence = createAccountMirrorPersistence({
    config: deps.config,
  });
  const registry = deps.registry ?? createAccountMirrorStatusRegistry({
    config: deps.config,
    readPersistentState: persistence.readState,
  });
  server.registerTool(
    'account_mirror_status',
    {
      title: 'Read account mirror status',
      description:
        'Read Aura-Call lazy account mirror posture without launching browsers, touching CDP, or scraping provider pages.',
      inputSchema: accountMirrorStatusInputShape,
      outputSchema: accountMirrorStatusOutputShape,
    },
    createAccountMirrorStatusToolHandler({ registry }),
  );
}

export function createAccountMirrorStatusToolHandler(input: {
  registry: AccountMirrorStatusRegistry;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorStatusInputShape).parse(rawInput);
    await input.registry.refreshPersistentState?.();
    const status = input.registry.readStatus({
      provider: payload.provider,
      runtimeProfileId: payload.runtimeProfile,
      explicitRefresh: payload.explicitRefresh,
    });
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `Account mirrors: ${status.metrics.eligible} eligible, ` +
            `${status.metrics.delayed} delayed, ${status.metrics.blocked} blocked.`,
        },
      ],
      structuredContent: status as typeof status & Record<string, unknown>,
    };
  };
}
