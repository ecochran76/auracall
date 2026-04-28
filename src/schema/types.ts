import { z } from 'zod';
import { parseDuration } from '../browser/utils.js';
import { ChatgptFeatureSchema, GeminiFeatureSchema, GrokFeatureSchema } from '../browser/llmService/providers/schema.js';

// Helper for duration parsing (string "1h" or number ms)
// biome-ignore lint/style/useNamingConvention: schema helper naming is stable.
const DurationMs = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    return parseDuration(val, 0);
  });

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const NotifyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  sound: z.boolean().optional(),
  muteIn: z.array(z.enum(['CI', 'SSH'])).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const AzureConfigSchema = z.object({
  endpoint: z.string().optional(),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RemoteServiceConfigSchema = z.object({
  host: z.string().optional(),
  token: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserListConfigSchema = z.object({
  includeHistory: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  filter: z.string().optional(),
  refresh: z.boolean().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceIdentitySchema = z.object({
  name: z.string().optional(),
  handle: z.string().optional(),
  email: z.string().optional(),
  accountId: z.string().optional(),
  accountLevel: z.string().optional(),
  accountPlanType: z.string().optional(),
  accountStructure: z.string().optional(),
  organizationId: z.string().optional(),
  capabilityProfile: z.string().optional(),
  proAccess: z.string().optional(),
  deepResearchAccess: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ServiceConfigSchema = z.object({
  url: z.string().optional(),
  identity: ServiceIdentitySchema.optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  conversationId: z.string().optional(),
  conversationName: z.string().optional(),
  model: z.string().optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ChatgptServiceConfigSchema = ServiceConfigSchema.extend({
  features: ChatgptFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GrokServiceConfigSchema = ServiceConfigSchema.extend({
  features: GrokFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GeminiServiceConfigSchema = ServiceConfigSchema.extend({
  features: GeminiFeatureSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const LlmDefaultsSchema = z.object({
  model: z.string().optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  defaultProjectName: z.string().optional(),
  defaultProjectId: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserCacheConfigSchema = z.object({
  store: z.enum(['json', 'sqlite', 'dual']).optional(),
  refresh: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  includeProjectOnlyConversations: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  cleanupDays: z.number().optional(),
  identityKey: z.string().optional(),
  identity: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      handle: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  rootDir: z.string().optional(),
  useDetectedIdentity: z.boolean().optional(),
  refreshHours: z.number().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserSessionOpenConfigSchema = z.object({
  openConversation: z.boolean().optional(),
  printUrl: z.boolean().optional(),
  browserPath: z.string().optional(),
  browserProfile: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserConfigSchema = z.object({
  // Targeting
  target: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  
  // Scope
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  conversationId: z.string().optional(),
  conversationName: z.string().optional(),
  
  // URLs
  grokUrl: z.string().optional(),
  chatgptUrl: z.string().optional(),
  geminiUrl: z.string().optional(),
  url: z.string().optional(), // generic/fallback
  
  // Chrome / Lifecycle
  chromeProfile: z.string().optional(),
  chromePath: z.string().optional(),
  chromeCookiePath: z.string().optional(),
  bootstrapCookiePath: z.string().optional(),
  display: z.string().optional(),
  managedProfileRoot: z.string().optional(),
  profileConflictAction: z.enum(['fail', 'terminate-existing', 'attach-existing']).optional(),
  blockingProfileAction: z.enum(['fail', 'restart', 'restart-managed', 'restart-auracall']).optional(),
  headless: z.boolean().optional(),
  hideWindow: z.boolean().optional(),
  keepBrowser: z.boolean().optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  wslChromePreference: z.enum(['auto', 'wsl', 'windows']).optional(),
  serviceTabLimit: z.number().int().positive().optional(),
  blankTabLimit: z.number().int().min(0).optional(),
  collapseDisposableWindows: z.boolean().optional(),
  
  // Connection
  debugPort: z.number().optional(),
  debugPortStrategy: z.enum(['fixed', 'auto']).optional(),
  debugPortRange: z.tuple([z.number(), z.number()]).optional(),
  remoteChrome: z.object({ host: z.string(), port: z.number() }).optional().or(z.string().optional()), // CLI passes string
  
  // Timing
  timeoutMs: DurationMs.optional(),
  inputTimeoutMs: DurationMs.optional(),
  cookieSyncWaitMs: DurationMs.optional(),
  
  // Cookies
  cookieNames: z.array(z.string()).optional().or(z.string().optional()), // CLI passes string
  inlineCookies: z.string().optional(), // JSON or Base64 string
  inlineCookiesFile: z.string().optional(),
  allowCookieErrors: z.boolean().optional(),
  noCookieSync: z.boolean().optional(),
  
  // Behavior
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  attachments: z.enum(['auto', 'never', 'always']).optional(),
  inlineFiles: z.boolean().optional(),
  bundleFiles: z.boolean().optional(),
  
  // Sub-configs
  list: BrowserListConfigSchema.optional(),
  cache: BrowserCacheConfigSchema.optional(),
  sessionOpen: BrowserSessionOpenConfigSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileBrowserSchema = z.object({
  chromePath: z.string().optional(),
  chromeProfile: z.string().optional(),
  profilePath: z.string().optional(),
  profileName: z.string().optional(),
  chromeCookiePath: z.string().optional(),
  cookiePath: z.string().optional(),
  bootstrapCookiePath: z.string().optional(),
  display: z.string().optional(),
  managedProfileRoot: z.string().optional(),
  profileConflictAction: z.enum(['fail', 'terminate-existing', 'attach-existing']).optional(),
  blockingProfileAction: z.enum(['fail', 'restart', 'restart-managed', 'restart-auracall']).optional(),
  manualLogin: z.boolean().optional(),
  interactiveLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  headless: z.boolean().optional(),
  hideWindow: z.boolean().optional(),
  keepBrowser: z.boolean().optional(),
  debugPort: z.number().optional(),
  debugPortStrategy: z.enum(['fixed', 'auto']).optional(),
  debugPortRange: z.tuple([z.number(), z.number()]).optional(),
  remoteChrome: z.object({ host: z.string(), port: z.number() }).optional().or(z.string().optional()),
  thinkingTime: z.enum(['light', 'standard', 'extended', 'heavy']).optional(),
  composerTool: z.string().optional(),
  modelStrategy: z.enum(['select', 'current', 'ignore']).optional(),
  attachments: z.enum(['auto', 'never', 'always']).optional(),
  inlineFiles: z.boolean().optional(),
  bundleFiles: z.boolean().optional(),
  cookieNames: z.array(z.string()).optional().or(z.string().optional()),
  inlineCookies: z.string().optional(),
  inlineCookiesFile: z.string().optional(),
  allowCookieErrors: z.boolean().optional(),
  noCookieSync: z.boolean().optional(),
  cookieSyncWaitMs: DurationMs.optional(),
  wslChromePreference: z.enum(['auto', 'wsl', 'windows']).optional(),
  serviceTabLimit: z.number().int().positive().optional(),
  blankTabLimit: z.number().int().min(0).optional(),
  collapseDisposableWindows: z.boolean().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileCacheSchema = z.object({
  store: z.enum(['json', 'sqlite', 'dual']).optional(),
  refresh: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  includeProjectOnlyConversations: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  cleanupDays: z.number().optional(),
  rootDir: z.string().optional(),
  useDetectedIdentity: z.boolean().optional(),
  refreshHours: z.number().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileLlmSchema = LlmDefaultsSchema;

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RuntimeProfileBrowserReferenceSchema = z.object({
  browserFamily: z.string().optional(),
  browserProfile: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleProfileSchema = RuntimeProfileBrowserReferenceSchema.extend({
  engine: z.enum(['api', 'browser']).optional(),
  search: z.union([z.enum(['on', 'off']), z.boolean()])
    .transform((val) => {
      if (typeof val === 'boolean') return val ? 'on' : 'off';
      return val;
    })
    .optional(),
  defaultService: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  keepBrowser: z.boolean().optional(),
  browser: OracleProfileBrowserSchema.optional(),
  llm: OracleProfileLlmSchema.optional(),
  services: z
    .object({
      chatgpt: ChatgptServiceConfigSchema.optional(),
      gemini: GeminiServiceConfigSchema.optional(),
      grok: GrokServiceConfigSchema.optional(),
    })
    .optional(),
  cache: OracleProfileCacheSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleServicesSchema = z.object({
  chatgpt: ChatgptServiceConfigSchema.optional(),
  gemini: GeminiServiceConfigSchema.optional(),
  grok: GrokServiceConfigSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const BrowserProfilesConfigSchema = z.record(z.string(), OracleProfileBrowserSchema);

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const RuntimeProfilesConfigSchema = z.record(z.string(), OracleProfileSchema);

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const AgentConfigSchema = z.object({
  runtimeProfile: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamRoleConfigSchema = z.object({
  agent: z.string(),
  order: z.number().int().positive().optional(),
  instructions: z.string().optional(),
  responseShape: z.record(z.string(), z.unknown()).optional(),
  stepKind: z.enum(['prompt', 'analysis', 'handoff', 'review', 'synthesis']).optional(),
  handoffToRole: z.string().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const TeamConfigSchema = z.object({
  agents: z.array(z.string()).optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  roles: z.record(z.string(), TeamRoleConfigSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleDevConfigSchema = z.object({
  browserPortRange: z.tuple([z.number(), z.number()]).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeLocalShellPolicySchema = z.object({
  complexityStage: z.enum(['bounded-command', 'repo-automation', 'extended']).optional(),
  allowedCommands: z.array(z.string()).optional(),
  allowedCwdRoots: z.array(z.string()).optional(),
  defaultShellActionTimeoutMs: DurationMs.optional(),
  maxShellActionTimeoutMs: DurationMs.optional(),
  maxCaptureChars: z.number().int().positive().optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeLocalActionsSchema = z.object({
  shell: OracleRuntimeLocalShellPolicySchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const OracleRuntimeConfigSchema = z.object({
  localActions: OracleRuntimeLocalActionsSchema.optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ConfigSchema = z.object({
  version: z.number().optional(),
  globals: z
    .object({
      cacheRoot: z.string().optional(),
      logLevel: z.string().optional(),
    })
    .optional(),
  browserDefaults: OracleProfileBrowserSchema.optional(),
  browserFamilies: BrowserProfilesConfigSchema.optional(),
  browserProfiles: BrowserProfilesConfigSchema.optional(),
  llmDefaults: LlmDefaultsSchema.optional(),
  profiles: RuntimeProfilesConfigSchema.optional(),
  runtimeProfiles: RuntimeProfilesConfigSchema.optional(),
  // Core
  engine: z.enum(['api', 'browser']).optional(),
  model: z.string().default('gpt-5.2-pro'),
  prompt: z.string().optional(),
  promptSuffix: z.string().optional(),
  
  // Files
  file: z.array(z.string()).optional(),
  filesReport: z.boolean().optional(),
  
  // Search
  search: z.union([z.enum(['on', 'off']), z.boolean()])
    .transform((val) => {
      if (typeof val === 'boolean') return val ? 'on' : 'off';
      return val;
    })
    .optional(),
  
  // Output
  writeOutput: z.string().optional(), // overwrite
  writeOutputPath: z.string().optional(), // append model
  renderMarkdown: z.boolean().optional(),
  renderPlain: z.boolean().optional(),
  verboseRender: z.boolean().optional(),
  
  // Notification
  notify: NotifyConfigSchema.optional(),
  
  // Azure
  azure: AzureConfigSchema.optional(),
  
  // Remote
  remote: RemoteServiceConfigSchema.optional(),
  remoteHost: z.string().optional(),
  remoteToken: z.string().optional(),
  
  // Misc
  verbose: z.boolean().optional(),
  timeout: DurationMs.optional(), // CLI --timeout
  apiBaseUrl: z.string().optional(),
  sessionRetentionHours: z.number().optional(),
  background: z.boolean().optional(),
  heartbeatSeconds: z.number().optional(),
  
  // Profiles + services
  defaultRuntimeProfile: z.string().optional(),
  auracallProfile: z.string().optional(),
  auracallProfiles: RuntimeProfilesConfigSchema.optional(),
  services: OracleServicesSchema.optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  teams: z.record(z.string(), TeamConfigSchema).optional(),
  dev: OracleDevConfigSchema.optional(),
  runtime: OracleRuntimeConfigSchema.optional(),

  // Nested
  browser: BrowserConfigSchema.default({}),
});

export type OracleConfig = z.infer<typeof ConfigSchema>;
