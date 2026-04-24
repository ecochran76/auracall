import { z } from 'zod';
import type {
  WorkbenchCapability,
  WorkbenchCapabilityInputSpec,
  WorkbenchCapabilityOutputSpec,
  WorkbenchCapabilityReport,
  WorkbenchCapabilityReportRequest,
  WorkbenchCapabilitySafety,
} from './types.js';

export const WorkbenchCapabilityProviderSchema = z.enum(['chatgpt', 'gemini', 'grok']);

export const WorkbenchCapabilityCategorySchema = z.enum([
  'research',
  'media',
  'canvas',
  'connector',
  'skill',
  'app',
  'search',
  'file',
  'other',
]);

export const WorkbenchCapabilityInvocationModeSchema = z.enum([
  'pre_prompt_toggle',
  'tool_drawer_selection',
  'composer_attachment',
  'provider_api',
  'post_prompt_action',
  'unknown',
]);

export const WorkbenchCapabilitySurfaceSchema = z.enum([
  'cli',
  'local_api',
  'mcp',
  'browser_service',
  'provider_api',
]);

export const WorkbenchCapabilityAvailabilitySchema = z.enum([
  'available',
  'not_visible',
  'account_gated',
  'human_verification_required',
  'blocked',
  'unknown',
]);

export const WorkbenchCapabilityStabilitySchema = z.enum([
  'stable',
  'experimental',
  'observed',
  'deprecated',
]);

export const WorkbenchCapabilityInputSpecSchema: z.ZodType<WorkbenchCapabilityInputSpec> = z.object({
  name: z.string().min(1),
  required: z.boolean(),
  description: z.string().nullable().optional(),
});

export const WorkbenchCapabilityOutputSpecSchema: z.ZodType<WorkbenchCapabilityOutputSpec> = z.object({
  artifactTypes: z.array(z.string().min(1)).optional(),
  description: z.string().nullable().optional(),
});

export const WorkbenchCapabilitySafetySchema: z.ZodType<WorkbenchCapabilitySafety> = z.object({
  requiresUserConsent: z.boolean().optional(),
  maySpendCredits: z.boolean().optional(),
  mayUseExternalAccount: z.boolean().optional(),
  mayTakeMinutes: z.boolean().optional(),
  notes: z.array(z.string()).optional(),
});

export const WorkbenchCapabilitySchema: z.ZodType<WorkbenchCapability> = z.object({
  id: z.string().min(1),
  provider: WorkbenchCapabilityProviderSchema,
  providerLabels: z.array(z.string().min(1)),
  category: WorkbenchCapabilityCategorySchema,
  invocationMode: WorkbenchCapabilityInvocationModeSchema,
  surfaces: z.array(WorkbenchCapabilitySurfaceSchema),
  availability: WorkbenchCapabilityAvailabilitySchema,
  stability: WorkbenchCapabilityStabilitySchema,
  requiredInputs: z.array(WorkbenchCapabilityInputSpecSchema),
  output: WorkbenchCapabilityOutputSpecSchema,
  safety: WorkbenchCapabilitySafetySchema,
  observedAt: z.string().nullable().optional(),
  source: z.enum(['static_catalog', 'browser_discovery', 'provider_api', 'test_fixture']),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const WorkbenchCapabilityReportRequestSchema: z.ZodType<WorkbenchCapabilityReportRequest> = z.object({
  provider: WorkbenchCapabilityProviderSchema.nullable().optional(),
  category: WorkbenchCapabilityCategorySchema.nullable().optional(),
  runtimeProfile: z.string().trim().min(1).nullable().optional(),
  includeUnavailable: z.boolean().nullable().optional(),
  diagnostics: z.enum(['browser-state']).nullable().optional(),
  entrypoint: z.enum(['grok-imagine']).nullable().optional(),
});

export const WorkbenchCapabilityReportSchema: z.ZodType<WorkbenchCapabilityReport> = z.object({
  object: z.literal('workbench_capability_report'),
  generatedAt: z.string(),
  provider: WorkbenchCapabilityProviderSchema.nullable().optional(),
  category: WorkbenchCapabilityCategorySchema.nullable().optional(),
  runtimeProfile: z.string().nullable().optional(),
  browserDiagnostics: z.any().nullable().optional(),
  capabilities: z.array(WorkbenchCapabilitySchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    accountGated: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
});
