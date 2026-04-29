import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AccountMirrorRefreshError,
  createAccountMirrorRefreshService,
  type AccountMirrorRefreshService,
} from '../../accountMirror/refreshService.js';
import type { AccountMirrorStatusRegistry } from '../../accountMirror/statusRegistry.js';

const accountMirrorRefreshInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  explicitRefresh: z.boolean().optional(),
  queueTimeoutMs: z.number().int().nonnegative().optional(),
  queuePollMs: z.number().int().positive().optional(),
} satisfies z.ZodRawShape;

const metadataCountsShape = z.object({
  projects: z.number(),
  conversations: z.number(),
  artifacts: z.number(),
  files: z.number(),
  media: z.number(),
});

const metadataEvidenceShape = z.object({
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
}).nullable();

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

const accountMirrorRefreshOutputShape = {
  object: z.literal('account_mirror_refresh'),
  requestId: z.string(),
  status: z.enum(['completed', 'blocked', 'busy']),
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfileId: z.string(),
  browserProfileId: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  dispatcher: z.object({
    key: z.string().nullable(),
    operationId: z.string().nullable(),
    blockedBy: z.record(z.string(), z.unknown()).nullable(),
  }),
  metadataCounts: metadataCountsShape,
  metadataEvidence: metadataEvidenceShape,
  mirrorCompleteness: mirrorCompletenessShape,
  detectedIdentityKey: z.string().nullable(),
  detectedAccountLevel: z.string().nullable(),
  mirrorStatus: z.unknown(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorRefreshToolDeps {
  service?: AccountMirrorRefreshService;
  registry?: AccountMirrorStatusRegistry;
  config?: Record<string, unknown> | null;
}

export function registerAccountMirrorRefreshTool(
  server: McpServer,
  deps: RegisterAccountMirrorRefreshToolDeps = {},
): void {
  const service = deps.service ?? createAccountMirrorRefreshService({
    config: deps.config,
    registry: deps.registry,
  });
  server.registerTool(
    'account_mirror_refresh',
    {
      title: 'Request account mirror refresh',
      description:
        'Request one explicit Aura-Call account mirror refresh through the browser operation dispatcher. Current implementation is default ChatGPT metadata-only.',
      inputSchema: accountMirrorRefreshInputShape,
      outputSchema: accountMirrorRefreshOutputShape,
    },
    createAccountMirrorRefreshToolHandler({ service }),
  );
}

export function createAccountMirrorRefreshToolHandler(input: {
  service: AccountMirrorRefreshService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorRefreshInputShape).parse(rawInput);
    try {
      const result = await input.service.requestRefresh({
        provider: payload.provider,
        runtimeProfileId: payload.runtimeProfile,
        explicitRefresh: payload.explicitRefresh,
        queueTimeoutMs: payload.queueTimeoutMs,
        queuePollMs: payload.queuePollMs,
      });
      return {
        isError: false,
        content: [
          {
            type: 'text' as const,
            text:
              `Account mirror refresh ${result.status}: ` +
              `${result.provider}/${result.runtimeProfileId} ` +
              `conversations=${result.metadataCounts.conversations}.`,
          },
        ],
        structuredContent: result as typeof result & Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof AccountMirrorRefreshError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: error.message,
            },
          ],
          structuredContent: {
            object: 'account_mirror_refresh_error',
            code: error.code,
            statusCode: error.statusCode,
            details: error.details,
          },
        };
      }
      throw error;
    }
  };
}
