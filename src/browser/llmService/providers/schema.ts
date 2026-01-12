import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
const FeatureFlagSchema = z.boolean().optional();

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ChatgptFeatureSchema = z.object({
  web_search: FeatureFlagSchema,
  deep_research: FeatureFlagSchema,
  company_knowledge: FeatureFlagSchema,
  apps: z.array(z.string()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GrokFeatureSchema = z.object({
  search: FeatureFlagSchema,
  sources: FeatureFlagSchema,
  apps: z.array(z.string()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const GeminiFeatureSchema = z.object({
  search: FeatureFlagSchema,
  grounding: FeatureFlagSchema,
  apps: z.array(z.string()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const LlmServiceFeatureSchemas = {
  chatgpt: ChatgptFeatureSchema,
  grok: GrokFeatureSchema,
  gemini: GeminiFeatureSchema,
};
