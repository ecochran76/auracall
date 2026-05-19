import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createRunArchiveService,
  type RunArchiveService,
} from '../../runtime/archiveService.js';
import {
  type ArchiveMaterializationJobService,
} from '../../runtime/archiveMaterializationJobService.js';

const runArchiveKindShape = z.enum([
  'all',
  'response',
  'response_batch',
  'team_run',
  'media_generation',
  'upload',
  'generated_artifact',
  'provider_conversation',
  'evidence',
]);

const runArchiveSearchInputShape = {
  kind: runArchiveKindShape.optional(),
  provider: z.string().min(1).optional(),
  runtimeProfile: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  responseId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  limit: z.number().int().nonnegative().optional(),
} satisfies z.ZodRawShape;

const runArchiveItemInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const runArchiveMaterializationCreateInputShape = {
  archiveItemId: z.string().min(1),
} satisfies z.ZodRawShape;

const runArchiveMaterializationJobInputShape = {
  id: z.string().min(1),
} satisfies z.ZodRawShape;

const runArchiveAssetLookupInputShape = {
  checksumSha256: z.string().min(1).optional(),
  cacheKey: z.string().min(1).optional(),
  providerArtifactId: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  limit: z.number().int().nonnegative().optional(),
} satisfies z.ZodRawShape;

const runArchiveEvidenceInputShape = {
  id: z.string().min(1).optional(),
  producer: z.string().min(1),
  schema: z.string().min(1),
  status: z.enum(['pass', 'fail', 'warning', 'info', 'unknown']).optional(),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  responseId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  archiveItemId: z.string().min(1).optional(),
  providerConversationId: z.string().min(1).optional(),
  data: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
} satisfies z.ZodRawShape;

const runtimeStateShape = z
  .enum(['queued', 'running', 'recovering', 'finalizing', 'stranded', 'terminal'])
  .nullable()
  .optional();

const archiveItemShape = z.object({
  id: z.string(),
  object: z.literal('run_archive_item'),
  kind: z.enum([
    'response',
    'response_batch',
    'team_run',
    'media_generation',
    'upload',
    'generated_artifact',
    'provider_conversation',
    'evidence',
  ]),
  source: z.enum(['runtime', 'response_batch', 'media_generation', 'evidence']),
  createdAt: z.string(),
  updatedAt: z.string(),
  title: z.string().nullable(),
  status: z.string().nullable(),
  runtimeState: runtimeStateShape,
  provider: z.string().nullable(),
  runtimeProfile: z.string().nullable(),
  browserProfile: z.string().nullable(),
  projectId: z.string().nullable(),
  boundIdentityKey: z.string().nullable(),
  agentId: z.string().nullable(),
  teamId: z.string().nullable(),
  responseId: z.string().nullable(),
  batchId: z.string().nullable(),
  batchIndex: z.number().nullable(),
  mediaGenerationId: z.string().nullable(),
  providerConversationId: z.string().nullable(),
  providerConversationUrl: z.string().nullable(),
  artifactId: z.string().nullable(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  localPath: z.string().nullable(),
  uri: z.string().nullable(),
  cacheKey: z.string().nullable(),
  checksumSha256: z.string().nullable(),
  fileAvailable: z.boolean().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  links: z.record(z.string(), z.string()),
});

const runArchiveSearchOutputShape = {
  object: z.literal('run_archive'),
  generatedAt: z.string(),
  kind: runArchiveKindShape,
  limit: z.number(),
  items: z.array(archiveItemShape),
  metrics: z.object({
    total: z.number(),
    byKind: z.record(z.string(), z.number()),
  }),
} satisfies z.ZodRawShape;

const runArchiveItemOutputShape = {
  object: z.literal('run_archive_item_detail'),
  generatedAt: z.string(),
  item: archiveItemShape,
} satisfies z.ZodRawShape;

const runArchiveAssetLookupOutputShape = {
  object: z.literal('run_archive_asset_lookup'),
  generatedAt: z.string(),
  query: z.object({
    checksumSha256: z.string().nullable(),
    cacheKey: z.string().nullable(),
    providerArtifactId: z.string().nullable(),
    artifactId: z.string().nullable(),
  }),
  canonicalItem: archiveItemShape.nullable(),
  items: z.array(archiveItemShape),
  metrics: z.object({
    total: z.number(),
    fileAvailable: z.number(),
    duplicateCacheKeys: z.array(z.string()),
  }),
} satisfies z.ZodRawShape;

const runArchiveBackfillOutputShape = {
  object: z.literal('run_archive_backfill'),
  generatedAt: z.string(),
  index: z.object({
    updatedAt: z.string(),
    itemCount: z.number(),
  }),
  metrics: z.object({
    byKind: z.record(z.string(), z.number()),
  }),
} satisfies z.ZodRawShape;

const runArchiveEvidenceOutputShape = {
  object: z.literal('run_archive_evidence_result'),
  generatedAt: z.string(),
  evidence: z.object({
    id: z.string(),
    object: z.literal('run_archive_evidence'),
    createdAt: z.string(),
    updatedAt: z.string(),
    producer: z.string(),
    schema: z.string(),
    status: z.enum(['pass', 'fail', 'warning', 'info', 'unknown']),
    title: z.string().nullable(),
    summary: z.string().nullable(),
    responseId: z.string().nullable(),
    batchId: z.string().nullable(),
    archiveItemId: z.string().nullable(),
    providerConversationId: z.string().nullable(),
    data: z.unknown(),
    metadata: z.record(z.string(), z.unknown()),
  }),
  item: archiveItemShape,
} satisfies z.ZodRawShape;

const archiveMaterializationJobShape = z.object({
  object: z.literal('run_archive_materialization_job'),
  id: z.string(),
  archiveItemId: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'skipped', 'failed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  attemptCount: z.number(),
  result: z.unknown().nullable(),
  error: z.object({
    message: z.string(),
    type: z.enum(['invalid_request_error', 'not_found_error', 'provider_auth_conflict', 'internal_error']),
    statusCode: z.number(),
  }).nullable(),
  message: z.string(),
});

const runArchiveMaterializationCreateOutputShape = {
  object: z.literal('run_archive_materialization_job_create_result'),
  generatedAt: z.string(),
  reused: z.boolean(),
  job: archiveMaterializationJobShape,
} satisfies z.ZodRawShape;

const runArchiveMaterializationJobOutputShape = archiveMaterializationJobShape.shape;

export interface RegisterRunArchiveToolsDeps {
  service?: RunArchiveService;
  materializationJobService?: ArchiveMaterializationJobService;
}

export function registerRunArchiveTools(
  server: McpServer,
  deps: RegisterRunArchiveToolsDeps = {},
): void {
  const service = deps.service ?? createRunArchiveService();
  server.registerTool(
    'run_archive_search',
    {
      title: 'Search AuraCall run archive',
      description:
        'Search cached AuraCall-created runs, uploads, generated artifacts, and provider conversation references without browser work.',
      inputSchema: runArchiveSearchInputShape,
      outputSchema: runArchiveSearchOutputShape,
    },
    createRunArchiveSearchToolHandler({ service }),
  );
  server.registerTool(
    'run_archive_item',
    {
      title: 'Read AuraCall run archive item',
      description:
        'Read one cached AuraCall run archive item by stable archive id without browser work.',
      inputSchema: runArchiveItemInputShape,
      outputSchema: runArchiveItemOutputShape,
    },
    createRunArchiveItemToolHandler({ service }),
  );
  server.registerTool(
    'run_archive_asset_lookup',
    {
      title: 'Resolve AuraCall archived asset',
      description:
        'Resolve cached AuraCall upload/generated artifact files by checksum, cache key, provider artifact id, or artifact id without browser work.',
      inputSchema: runArchiveAssetLookupInputShape,
      outputSchema: runArchiveAssetLookupOutputShape,
    },
    createRunArchiveAssetLookupToolHandler({ service }),
  );
  server.registerTool(
    'run_archive_backfill',
    {
      title: 'Backfill AuraCall run archive index',
      description:
        'Rebuild the cached AuraCall run archive index from runtime records without browser work.',
      inputSchema: {},
      outputSchema: runArchiveBackfillOutputShape,
    },
    createRunArchiveBackfillToolHandler({ service }),
  );
  server.registerTool(
    'run_archive_attach_evidence',
    {
      title: 'Attach caller evidence to AuraCall archive',
      description:
        'Store caller-owned validation, review, or post-processing evidence beside AuraCall archive records without domain-specific interpretation.',
      inputSchema: runArchiveEvidenceInputShape,
      outputSchema: runArchiveEvidenceOutputShape,
    },
    createRunArchiveAttachEvidenceToolHandler({ service }),
  );
  if (deps.materializationJobService) {
    server.registerTool(
      'run_archive_materialization_create',
      {
        title: 'Queue AuraCall archive materialization',
        description:
          'Queue a durable provider-backed job that materializes one generated artifact archive item.',
        inputSchema: runArchiveMaterializationCreateInputShape,
        outputSchema: runArchiveMaterializationCreateOutputShape,
      },
      createRunArchiveMaterializationCreateToolHandler({ service: deps.materializationJobService }),
    );
    server.registerTool(
      'run_archive_materialization_job',
      {
        title: 'Read AuraCall archive materialization job',
        description:
          'Read one durable archive materialization job by id.',
        inputSchema: runArchiveMaterializationJobInputShape,
        outputSchema: runArchiveMaterializationJobOutputShape,
      },
      createRunArchiveMaterializationJobToolHandler({ service: deps.materializationJobService }),
    );
  }
}

export function createRunArchiveSearchToolHandler(input: {
  service: RunArchiveService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveSearchInputShape).parse(rawInput);
    const result = await input.service.listItems(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Run archive: ${result.metrics.total} item${result.metrics.total === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveItemToolHandler(input: {
  service: RunArchiveService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveItemInputShape).parse(rawInput);
    const result = await input.service.readItem(payload.id);
    if (!result) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Run archive item ${payload.id} was not found.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `Run archive item ${result.item.id}: ${result.item.kind}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveAssetLookupToolHandler(input: {
  service: RunArchiveService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveAssetLookupInputShape).parse(rawInput);
    const result = await input.service.lookupAsset(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Run archive asset lookup: ${result.metrics.total} item${result.metrics.total === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveBackfillToolHandler(input: {
  service: RunArchiveService;
}) {
  return async () => {
    const result = await input.service.backfillIndex();
    return {
      content: [
        {
          type: 'text' as const,
          text: `Run archive index backfilled: ${result.index.itemCount} item${result.index.itemCount === 1 ? '' : 's'}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveAttachEvidenceToolHandler(input: {
  service: RunArchiveService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveEvidenceInputShape).parse(rawInput);
    const result = await input.service.attachEvidence(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Run archive evidence attached: ${result.item.id}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveMaterializationCreateToolHandler(input: {
  service: ArchiveMaterializationJobService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveMaterializationCreateInputShape).parse(rawInput);
    const result = await input.service.createJob(payload);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Archive materialization job ${result.job.id}: ${result.job.status}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}

export function createRunArchiveMaterializationJobToolHandler(input: {
  service: ArchiveMaterializationJobService;
}) {
  return async (rawInput: unknown) => {
    const payload = z.object(runArchiveMaterializationJobInputShape).parse(rawInput);
    const result = await input.service.readJob(payload.id);
    if (!result) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Archive materialization job ${payload.id} was not found.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `Archive materialization job ${result.id}: ${result.status}.`,
        },
      ],
      structuredContent: result as typeof result & Record<string, unknown>,
    };
  };
}
