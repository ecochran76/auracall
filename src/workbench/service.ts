import { STATIC_WORKBENCH_CAPABILITY_CATALOG } from './catalog.js';
import {
  WorkbenchCapabilityReportRequestSchema,
  WorkbenchCapabilityReportSchema,
  WorkbenchCapabilitySchema,
} from './schema.js';
import type {
  WorkbenchCapability,
  WorkbenchCapabilityReport,
  WorkbenchCapabilityReportRequest,
  WorkbenchCapabilityReporter,
} from './types.js';

export interface WorkbenchCapabilityServiceDeps {
  now?: () => Date;
  catalog?: WorkbenchCapability[];
  discoverCapabilities?: (request: WorkbenchCapabilityReportRequest) => Promise<WorkbenchCapability[]>;
}

export function createWorkbenchCapabilityService(
  deps: WorkbenchCapabilityServiceDeps = {},
): WorkbenchCapabilityReporter {
  const now = deps.now ?? (() => new Date());
  const catalog = deps.catalog ?? STATIC_WORKBENCH_CAPABILITY_CATALOG;

  return {
    async listCapabilities(input = {}) {
      const request = WorkbenchCapabilityReportRequestSchema.parse(input);
      const discovered = deps.discoverCapabilities ? await deps.discoverCapabilities(request) : [];
      const capabilities = mergeCapabilities([...catalog, ...discovered])
        .filter((capability) => !request.provider || capability.provider === request.provider)
        .filter((capability) => !request.category || capability.category === request.category)
        .filter((capability) => {
          if (request.includeUnavailable !== false) return true;
          return capability.availability !== 'not_visible' && capability.availability !== 'blocked';
        })
        .sort(compareCapabilities)
        .map((capability) => WorkbenchCapabilitySchema.parse(capability));

      const report: WorkbenchCapabilityReport = {
        object: 'workbench_capability_report',
        generatedAt: now().toISOString(),
        provider: request.provider ?? null,
        category: request.category ?? null,
        runtimeProfile: request.runtimeProfile ?? null,
        capabilities,
        summary: {
          total: capabilities.length,
          available: capabilities.filter((capability) => capability.availability === 'available').length,
          accountGated: capabilities.filter((capability) => capability.availability === 'account_gated').length,
          unknown: capabilities.filter((capability) => capability.availability === 'unknown').length,
          blocked: capabilities.filter((capability) => capability.availability === 'blocked').length,
        },
      };
      return WorkbenchCapabilityReportSchema.parse(report);
    },
  };
}

function mergeCapabilities(capabilities: WorkbenchCapability[]): WorkbenchCapability[] {
  const byId = new Map<string, WorkbenchCapability>();
  for (const capability of capabilities) {
    const parsed = WorkbenchCapabilitySchema.parse(capability);
    byId.set(parsed.id, {
      ...(byId.get(parsed.id) ?? {}),
      ...parsed,
      providerLabels: Array.from(new Set([...(byId.get(parsed.id)?.providerLabels ?? []), ...parsed.providerLabels])),
    });
  }
  return Array.from(byId.values());
}

function compareCapabilities(left: WorkbenchCapability, right: WorkbenchCapability): number {
  return (
    left.provider.localeCompare(right.provider) ||
    left.category.localeCompare(right.category) ||
    left.id.localeCompare(right.id)
  );
}
