import { z } from 'zod';

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
const FeatureFlagSchema = z.boolean().optional();

// biome-ignore lint/style/useNamingConvention: schema naming is stable.
export const ChatgptFeatureSchema = z.object({
  web_search: FeatureFlagSchema,
  deep_research: FeatureFlagSchema,
  company_knowledge: FeatureFlagSchema,
  shopping: FeatureFlagSchema,
  composer_tools: z.array(z.string()).optional(),
  apps: z.array(z.string()).optional(),
  composer_mode: z.enum(['chat', 'work']).optional(),
  composer_apps: z.array(z.object({
    name: z.string(),
    app_id: z.string().optional(),
    plugin_id: z.string().optional(),
    selection_state: z.enum(['selected', 'selectable', 'connect_required', 'unknown']).optional(),
  })).optional(),
  installed_apps: z.array(z.object({
    plugin_id: z.string(),
    canonical_app_id: z.string().optional(),
    provider_name: z.string().optional(),
    name: z.string(),
    app_ids: z.array(z.string()).optional(),
    status: z.string().optional(),
    enabled: z.boolean().optional(),
    installation_policy: z.string().optional(),
    authentication_policy: z.string().optional(),
    scope: z.string().optional(),
    discoverability: z.string().optional(),
    creator_name: z.string().optional(),
    release_version: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  linked_apps: z.array(z.object({
    link_id: z.string(),
    connector_id: z.string(),
    name: z.string(),
    auth_status: z.string().optional(),
    connector_status: z.string().optional(),
    visibility: z.string().optional(),
    disable_auto_invocation: z.boolean().optional(),
    actions_count: z.number().int().nonnegative().optional(),
  })).optional(),
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
