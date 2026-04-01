import { z } from 'zod';

const StringListSchema = z.array(z.string());
const StringToStringMapSchema = z.record(z.string(), z.string());

const ServiceModelEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: StringListSchema.optional(),
});

const ServiceRouteRegistrySchema = z
  .object({
    baseUrl: z.string().optional(),
    app: z.string().optional(),
    files: z.string().optional(),
    projectIndex: z.string().optional(),
    compatibleHosts: StringListSchema.optional(),
    cookieOrigins: StringListSchema.optional(),
    project: z.string().optional(),
    projectConversations: z.string().optional(),
    projectSources: z.string().optional(),
    conversation: z.string().optional(),
    projectConversation: z.string().optional(),
    conversationApi: z.string().optional(),
  })
  .strict();

const ServiceFeatureRegistrySchema = z
  .object({
    detector: z.string().optional(),
    flags: z.record(z.string(), StringListSchema).optional(),
    appTokens: z.record(z.string(), StringListSchema).optional(),
  })
  .strict();

const ServiceComposerRegistrySchema = z
  .object({
    aliases: z.record(z.string(), StringListSchema).optional(),
    knownLabels: StringListSchema.optional(),
    topLevelSentinels: StringListSchema.optional(),
    moreLabels: StringListSchema.optional(),
    topMenuSignalLabels: StringListSchema.optional(),
    topMenuSignalSubstrings: StringListSchema.optional(),
    chipIgnoreTokens: StringListSchema.optional(),
    fileRequestLabels: StringListSchema.optional(),
  })
  .strict();

const ServiceUiRegistrySchema = z
  .object({
    labels: z.record(z.string(), z.string()).optional(),
    labelSets: z.record(z.string(), StringListSchema).optional(),
  })
  .strict();

const ServiceSelectorRegistrySchema = z
  .object({
    input: StringListSchema.optional(),
    sendButton: StringListSchema.optional(),
    modelButton: StringListSchema.optional(),
    menuItem: StringListSchema.optional(),
    assistantBubble: StringListSchema.optional(),
    assistantRole: StringListSchema.optional(),
    copyButton: StringListSchema.optional(),
    composerRoot: StringListSchema.optional(),
    fileInput: StringListSchema.optional(),
    attachmentMenu: StringListSchema.optional(),
  })
  .strict();

const ServiceDomRegistrySchema = z
  .object({
    selectors: StringToStringMapSchema.optional(),
    selectorSets: z.record(z.string(), StringListSchema).optional(),
  })
  .strict();

const ServiceArtifactRegistrySchema = z
  .object({
    downloadKindExtensions: z.record(z.string(), StringListSchema).optional(),
    contentTypeExtensions: StringToStringMapSchema.optional(),
    nameMimeTypes: StringToStringMapSchema.optional(),
    defaultTitles: StringToStringMapSchema.optional(),
    payloadMarkers: z.record(z.string(), StringListSchema).optional(),
  })
  .strict();

const ServiceRegistryEntrySchema = z
  .object({
    models: z.array(ServiceModelEntrySchema).optional(),
    routes: ServiceRouteRegistrySchema.optional(),
    features: ServiceFeatureRegistrySchema.optional(),
    composer: ServiceComposerRegistrySchema.optional(),
    ui: ServiceUiRegistrySchema.optional(),
    selectors: ServiceSelectorRegistrySchema.optional(),
    dom: ServiceDomRegistrySchema.optional(),
    artifacts: ServiceArtifactRegistrySchema.optional(),
  })
  .strict();

const ServiceManifestSchema = z
  .object({
    version: z.number(),
    services: z.record(z.string(), ServiceRegistryEntrySchema),
  })
  .strict();

const ServiceRegistryFileSchema = ServiceManifestSchema.extend({
  templateHash: z.string().optional(),
});

export type ServicesManifest = z.infer<typeof ServiceManifestSchema>;
export type ServicesManifestFile = z.infer<typeof ServiceRegistryFileSchema>;

type ServicesManifestParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function formatSchemaIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path.join('.');
      return `${key || 'root'}: ${issue.message}`;
    })
    .join('; ');
}

function parseServicesPayload<T>(payload: string, schema: z.ZodType<T>, source: string): ServicesManifestParseResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch (error) {
    return {
      ok: false,
      message: `${source} is not valid JSON. ${(error as Error).message}`,
    };
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      message: `${source} has an invalid structure. ${formatSchemaIssues(parsed.error)}`,
    };
  }

  return {
    ok: true,
    value: parsed.data,
  };
}

export function parseServicesManifest(payload: string, source: string): ServicesManifestParseResult<ServicesManifest> {
  return parseServicesPayload(payload, ServiceManifestSchema, source);
}

export function parseServicesRegistryCache(
  payload: string,
  source: string,
): ServicesManifestParseResult<ServicesManifestFile> {
  return parseServicesPayload(payload, ServiceRegistryFileSchema, source);
}
