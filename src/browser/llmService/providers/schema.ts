import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
const FeatureFlagSchema = z.boolean().optional();

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ChatgptFeatureSchema = z.object({
  web_search: FeatureFlagSchema,
  deep_research: FeatureFlagSchema,
  company_knowledge: FeatureFlagSchema,
  apps: z.array(z.string()).optional(),
  model_controls: z.object({
    visible: z.boolean().optional(),
    label: z.string().optional(),
    aria_label: z.string().optional(),
    location: z.string().optional(),
    selector: z.string().optional(),
    model_options: z.array(z.string()).optional(),
    depth_options: z.array(z.string()).optional(),
    synthesized_options: z.array(z.string()).optional(),
    selected_model: z.string().optional(),
    selected_depth: z.string().optional(),
  }).optional(),
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
  deep_research: FeatureFlagSchema,
  personal_intelligence: FeatureFlagSchema,
  signed_out: FeatureFlagSchema,
  modes: z.array(z.string()).optional(),
  disabled_modes: z.array(z.string()).optional(),
  toggles: z.record(z.string(), z.boolean()).optional(),
  active_mode: z.string().optional(),
  apps: z.array(z.string()).optional(),
});

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const LlmServiceFeatureSchemas = {
  chatgpt: ChatgptFeatureSchema,
  grok: GrokFeatureSchema,
  gemini: GeminiFeatureSchema,
};
