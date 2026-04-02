import {
  AgentConfigSchema,
  BrowserConfigSchema,
  ChatgptServiceConfigSchema,
  OracleProfileBrowserSchema,
  ConfigSchema,
  GeminiServiceConfigSchema,
  GrokServiceConfigSchema,
  LlmDefaultsSchema,
  OracleProfileSchema,
  TeamConfigSchema,
  type OracleConfig,
} from '../schema/types.js';
import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ComposedConfigSchema = ConfigSchema.extend({
  browserDefaults: BrowserConfigSchema.optional(),
  browserFamilies: z.record(z.string(), OracleProfileBrowserSchema).optional(),
  llmDefaults: LlmDefaultsSchema.optional(),
  profiles: z.record(z.string(), OracleProfileSchema).optional(),
  services: z
    .object({
      chatgpt: ChatgptServiceConfigSchema.optional(),
      gemini: GeminiServiceConfigSchema.optional(),
      grok: GrokServiceConfigSchema.optional(),
    })
    .optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  teams: z.record(z.string(), TeamConfigSchema).optional(),
});

export { ConfigSchema };
export type { OracleConfig };
export type ResolvedUserConfig = z.infer<typeof ComposedConfigSchema>;
