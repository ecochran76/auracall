import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createAccountMirrorCatalogService,
  type AccountMirrorCatalogService,
} from '../../accountMirror/catalogService.js';
import type { AccountMirrorPersistence } from '../../accountMirror/cachePersistence.js';
import type { AccountMirrorStatusRegistry } from '../../accountMirror/statusRegistry.js';

const accountMirrorCatalogInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().min(1).optional(),
  kind: z.enum(['all', 'projects', 'conversations', 'artifacts', 'files', 'media']).optional(),
  limit: z.number().int().nonnegative().optional(),
} satisfies z.ZodRawShape;

const accountMirrorCatalogEntryShape = z.object({
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfileId: z.string(),
  browserProfileId: z.string().nullable(),
  boundIdentityKey: z.string().nullable(),
  status: z.enum(['eligible', 'delayed', 'blocked']),
  reason: z.string(),
  manifests: z.object({
    projects: z.array(z.unknown()),
    conversations: z.array(z.unknown()),
    artifacts: z.array(z.unknown()),
    files: z.array(z.unknown()),
    media: z.array(z.unknown()),
  }),
  counts: z.object({
    projects: z.number(),
    conversations: z.number(),
    artifacts: z.number(),
    files: z.number(),
    media: z.number(),
  }),
});

const accountMirrorCatalogOutputShape = {
  object: z.literal('account_mirror_catalog'),
  generatedAt: z.string(),
  kind: z.enum(['all', 'projects', 'conversations', 'artifacts', 'files', 'media']),
  limit: z.number(),
  entries: z.array(accountMirrorCatalogEntryShape),
  metrics: z.object({
    targets: z.number(),
    projects: z.number(),
    conversations: z.number(),
    artifacts: z.number(),
    files: z.number(),
    media: z.number(),
  }),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorCatalogToolDeps {
  service?: AccountMirrorCatalogService;
  registry?: AccountMirrorStatusRegistry;
  persistence?: AccountMirrorPersistence;
  config?: Record<string, unknown> | null;
}

export function registerAccountMirrorCatalogTool(
  server: McpServer,
  deps: RegisterAccountMirrorCatalogToolDeps = {},
): void {
  const service = deps.service ?? createAccountMirrorCatalogService({
    config: deps.config,
    registry: deps.registry,
    persistence: deps.persistence,
  });
  server.registerTool(
    'account_mirror_catalog',
    {
      title: 'Read account mirror catalog',
      description:
        'Read cached Aura-Call account mirror project, conversation, artifact, and media manifests without browser or CDP work.',
      inputSchema: accountMirrorCatalogInputShape,
      outputSchema: accountMirrorCatalogOutputShape,
    },
    createAccountMirrorCatalogToolHandler({ service }),
  );
}

export function createAccountMirrorCatalogToolHandler(input: {
  service: AccountMirrorCatalogService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorCatalogInputShape).parse(rawInput);
    const catalog = await input.service.readCatalog({
      provider: payload.provider,
      runtimeProfileId: payload.runtimeProfile,
      kind: payload.kind,
      limit: payload.limit,
    });
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `Account mirror catalog: ${catalog.metrics.targets} targets, ` +
            `${catalog.metrics.conversations} conversations, ${catalog.metrics.artifacts} artifacts.`,
        },
      ],
      structuredContent: catalog as typeof catalog & Record<string, unknown>,
    };
  };
}
