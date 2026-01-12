import {
  BrowserConfigSchema,
  ChatgptServiceConfigSchema,
  ConfigSchema,
  GeminiServiceConfigSchema,
  GrokServiceConfigSchema,
  LlmDefaultsSchema,
  OracleProfileSchema,
  type OracleConfig,
} from '../schema/types.js';
import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ComposedConfigSchema = ConfigSchema.extend({
  browserDefaults: BrowserConfigSchema.optional(),
  llmDefaults: LlmDefaultsSchema.optional(),
  profiles: z.record(z.string(), OracleProfileSchema).optional(),
  services: z
    .object({
      chatgpt: ChatgptServiceConfigSchema.optional(),
      gemini: GeminiServiceConfigSchema.optional(),
      grok: GrokServiceConfigSchema.optional(),
    })
    .optional(),
});

export { ConfigSchema };
export type { OracleConfig };
