import { z } from 'zod';
import { parseDuration } from '../browser/utils.js';

// Helper for duration parsing (string "1h" or number ms)
const DurationMs = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    return parseDuration(val, 0);
  });

export const NotifyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  sound: z.boolean().optional(),
  muteIn: z.array(z.enum(['CI', 'SSH'])).optional(),
});

export const AzureConfigSchema = z.object({
  endpoint: z.string().optional(),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
});

export const RemoteServiceConfigSchema = z.object({
  host: z.string().optional(),
  token: z.string().optional(),
});

export const BrowserListConfigSchema = z.object({
  includeHistory: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
  filter: z.string().optional(),
  refresh: z.boolean().optional(),
});

export const BrowserCacheConfigSchema = z.object({
  refresh: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  historyLimit: z.number().optional(),
  historySince: z.string().optional(),
});

export const BrowserSessionOpenConfigSchema = z.object({
  openConversation: z.boolean().optional(),
  printUrl: z.boolean().optional(),
  browserPath: z.string().optional(),
  browserProfile: z.string().optional(),
});

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
  headless: z.boolean().optional(),
  hideWindow: z.boolean().optional(),
  keepBrowser: z.boolean().optional(),
  manualLogin: z.boolean().optional(),
  manualLoginProfileDir: z.string().optional(),
  
  // Connection
  debugPort: z.number().optional(),
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
  attachments: z.enum(['auto', 'never', 'always']).optional(),
  inlineFiles: z.boolean().optional(),
  bundleFiles: z.boolean().optional(),
  
  // Sub-configs
  list: BrowserListConfigSchema.optional(),
  cache: BrowserCacheConfigSchema.optional(),
  sessionOpen: BrowserSessionOpenConfigSchema.optional(),
});

export const ConfigSchema = z.object({
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
  
  // Nested
  browser: BrowserConfigSchema.default({}),
});

export type OracleConfig = z.infer<typeof ConfigSchema>;