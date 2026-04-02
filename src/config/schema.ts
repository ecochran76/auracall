import {
  AgentConfigSchema,
  BrowserProfilesConfigSchema,
  BrowserConfigSchema,
  ChatgptServiceConfigSchema,
  ConfigSchema,
  GeminiServiceConfigSchema,
  GrokServiceConfigSchema,
  LlmDefaultsSchema,
  RuntimeProfilesConfigSchema,
  TeamConfigSchema,
  type OracleConfig,
} from '../schema/types.js';
import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ComposedConfigSchema = ConfigSchema.extend({
  browserDefaults: BrowserConfigSchema.optional(),
  browserFamilies: BrowserProfilesConfigSchema.optional(),
  llmDefaults: LlmDefaultsSchema.optional(),
  profiles: RuntimeProfilesConfigSchema.optional(),
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
