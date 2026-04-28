import { z } from 'zod';

const STRING_LIST_SCHEMA = z.array(z.string());
const STRING_TO_STRING_MAP_SCHEMA = z.record(z.string(), z.string());

const SERVICE_MODEL_ENTRY_SCHEMA = z.object({
  id: z.string(),
  label: z.string(),
  aliases: STRING_LIST_SCHEMA.optional(),
});

const SERVICE_ROUTE_REGISTRY_SCHEMA = z
  .object({
    baseUrl: z.string().optional(),
    app: z.string().optional(),
    files: z.string().optional(),
    projectIndex: z.string().optional(),
    compatibleHosts: STRING_LIST_SCHEMA.optional(),
    cookieOrigins: STRING_LIST_SCHEMA.optional(),
    project: z.string().optional(),
    projectConversations: z.string().optional(),
    projectSources: z.string().optional(),
    conversation: z.string().optional(),
    projectConversation: z.string().optional(),
    conversationApi: z.string().optional(),
  })
  .strict();

const SERVICE_FEATURE_REGISTRY_SCHEMA = z
  .object({
    detector: z.string().optional(),
    flags: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
    appTokens: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
  })
  .strict();

const SERVICE_COMPOSER_REGISTRY_SCHEMA = z
  .object({
    aliases: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
    knownLabels: STRING_LIST_SCHEMA.optional(),
    topLevelSentinels: STRING_LIST_SCHEMA.optional(),
    moreLabels: STRING_LIST_SCHEMA.optional(),
    topMenuSignalLabels: STRING_LIST_SCHEMA.optional(),
    topMenuSignalSubstrings: STRING_LIST_SCHEMA.optional(),
    chipIgnoreTokens: STRING_LIST_SCHEMA.optional(),
    fileRequestLabels: STRING_LIST_SCHEMA.optional(),
  })
  .strict();

const SERVICE_UI_REGISTRY_SCHEMA = z
  .object({
    labels: z.record(z.string(), z.string()).optional(),
    labelSets: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
  })
  .strict();

const SERVICE_SELECTOR_REGISTRY_SCHEMA = z
  .object({
    input: STRING_LIST_SCHEMA.optional(),
    sendButton: STRING_LIST_SCHEMA.optional(),
    modelButton: STRING_LIST_SCHEMA.optional(),
    menuItem: STRING_LIST_SCHEMA.optional(),
    assistantBubble: STRING_LIST_SCHEMA.optional(),
    assistantRole: STRING_LIST_SCHEMA.optional(),
    copyButton: STRING_LIST_SCHEMA.optional(),
    composerRoot: STRING_LIST_SCHEMA.optional(),
    fileInput: STRING_LIST_SCHEMA.optional(),
    attachmentMenu: STRING_LIST_SCHEMA.optional(),
  })
  .strict();

const SERVICE_DOM_REGISTRY_SCHEMA = z
  .object({
    selectors: STRING_TO_STRING_MAP_SCHEMA.optional(),
    selectorSets: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
  })
  .strict();

const SERVICE_ARTIFACT_REGISTRY_SCHEMA = z
  .object({
    downloadKindExtensions: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
    contentTypeExtensions: STRING_TO_STRING_MAP_SCHEMA.optional(),
    nameMimeTypes: STRING_TO_STRING_MAP_SCHEMA.optional(),
    defaultTitles: STRING_TO_STRING_MAP_SCHEMA.optional(),
    payloadMarkers: z.record(z.string(), STRING_LIST_SCHEMA).optional(),
  })
  .strict();

const SERVICE_REGISTRY_ENTRY_SCHEMA = z
  .object({
    models: z.array(SERVICE_MODEL_ENTRY_SCHEMA).optional(),
    routes: SERVICE_ROUTE_REGISTRY_SCHEMA.optional(),
    features: SERVICE_FEATURE_REGISTRY_SCHEMA.optional(),
    composer: SERVICE_COMPOSER_REGISTRY_SCHEMA.optional(),
    ui: SERVICE_UI_REGISTRY_SCHEMA.optional(),
    selectors: SERVICE_SELECTOR_REGISTRY_SCHEMA.optional(),
    dom: SERVICE_DOM_REGISTRY_SCHEMA.optional(),
    artifacts: SERVICE_ARTIFACT_REGISTRY_SCHEMA.optional(),
  })
  .strict();

const SERVICE_MANIFEST_SCHEMA = z
  .object({
    version: z.number(),
    services: z.record(z.string(), SERVICE_REGISTRY_ENTRY_SCHEMA),
  })
  .strict();

const SERVICE_REGISTRY_FILE_SCHEMA = SERVICE_MANIFEST_SCHEMA.extend({
  templateHash: z.string().optional(),
});

export type ServicesManifest = z.infer<typeof SERVICE_MANIFEST_SCHEMA>;
export type ServicesManifestFile = z.infer<typeof SERVICE_REGISTRY_FILE_SCHEMA>;

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
  return parseServicesPayload(payload, SERVICE_MANIFEST_SCHEMA, source);
}

export function parseServicesRegistryCache(
  payload: string,
  source: string,
): ServicesManifestParseResult<ServicesManifestFile> {
  return parseServicesPayload(payload, SERVICE_REGISTRY_FILE_SCHEMA, source);
}
