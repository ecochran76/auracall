import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createWorkbenchCapabilityService,
} from '../../workbench/service.js';
import { WorkbenchCapabilityReportRequestSchema } from '../../workbench/schema.js';
import type { WorkbenchCapabilityReport, WorkbenchCapabilityReporter } from '../../workbench/types.js';

const capabilityCategoryValues = [
  'research',
  'media',
  'canvas',
  'connector',
  'skill',
  'app',
  'search',
  'file',
  'other',
] as const;

const workbenchCapabilitiesInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']).nullable().optional(),
  category: z.enum(capabilityCategoryValues).nullable().optional(),
  runtimeProfile: z.string().min(1).nullable().optional(),
  includeUnavailable: z.boolean().nullable().optional(),
} satisfies z.ZodRawShape;

const workbenchCapabilityShape = z.object({
  id: z.string(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  providerLabels: z.array(z.string()),
  category: z.enum(capabilityCategoryValues),
  invocationMode: z.enum([
    'pre_prompt_toggle',
    'tool_drawer_selection',
    'composer_attachment',
    'provider_api',
    'post_prompt_action',
    'unknown',
  ]),
  surfaces: z.array(z.enum(['cli', 'local_api', 'mcp', 'browser_service', 'provider_api'])),
  availability: z.enum([
    'available',
    'not_visible',
    'account_gated',
    'human_verification_required',
    'blocked',
    'unknown',
  ]),
  stability: z.enum(['stable', 'experimental', 'observed', 'deprecated']),
  requiredInputs: z.array(z.object({
    name: z.string(),
    required: z.boolean(),
    description: z.string().nullable().optional(),
  })),
  output: z.object({
    artifactTypes: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
  }),
  safety: z.object({
    requiresUserConsent: z.boolean().optional(),
    maySpendCredits: z.boolean().optional(),
    mayUseExternalAccount: z.boolean().optional(),
    mayTakeMinutes: z.boolean().optional(),
    notes: z.array(z.string()).optional(),
  }),
  observedAt: z.string().nullable().optional(),
  source: z.enum(['static_catalog', 'browser_discovery', 'provider_api', 'test_fixture']),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const workbenchCapabilitiesOutputShape = {
  object: z.literal('workbench_capability_report'),
  generatedAt: z.string(),
  provider: z.enum(['chatgpt', 'gemini', 'grok']).nullable().optional(),
  category: z.enum(capabilityCategoryValues).nullable().optional(),
  runtimeProfile: z.string().nullable().optional(),
  capabilities: z.array(workbenchCapabilityShape),
  summary: z.object({
    total: z.number(),
    available: z.number(),
    accountGated: z.number(),
    unknown: z.number(),
    blocked: z.number(),
  }),
} satisfies z.ZodRawShape;

export interface RegisterWorkbenchCapabilitiesToolDeps {
  reporter?: WorkbenchCapabilityReporter;
}

export function registerWorkbenchCapabilitiesTool(
  server: McpServer,
  deps: RegisterWorkbenchCapabilitiesToolDeps = {},
): void {
  const reporter = deps.reporter ?? createWorkbenchCapabilityService();
  server.registerTool(
    'workbench_capabilities',
    {
      title: 'List Aura-Call workbench capabilities',
      description:
        'Report currently known or discovered provider workbench capabilities such as Deep Research, media tools, apps, skills, connectors, search, and canvas without invoking them.',
      inputSchema: workbenchCapabilitiesInputShape,
      outputSchema: workbenchCapabilitiesOutputShape,
    },
    createWorkbenchCapabilitiesToolHandler(reporter),
  );
}

export function createWorkbenchCapabilitiesToolHandler(reporter: WorkbenchCapabilityReporter) {
  return async (input: unknown) => {
    const textContent = (text: string) => [{ type: 'text' as const, text }];
    const request = WorkbenchCapabilityReportRequestSchema.parse(input ?? {});
    const result = await reporter.listCapabilities(request);
    return {
      content: textContent(
        `Workbench capabilities: ${result.summary.total} total, ${result.summary.available} available, ${result.summary.accountGated} account-gated, ${result.summary.unknown} unknown.`,
      ),
      structuredContent: result as WorkbenchCapabilityReport & Record<string, unknown>,
    };
  };
}
