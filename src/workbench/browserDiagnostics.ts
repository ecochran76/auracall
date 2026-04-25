import type { ResolvedUserConfig } from '../config.js';
import { probeBrowserRunDiagnostics } from '../browser/liveDiagnostics.js';
import type { RuntimeRunInspectionBrowserDiagnosticsSummary } from '../runtime/inspection.js';
import type { WorkbenchCapabilityReportRequest } from './types.js';
import { resolveWorkbenchCapabilityEntrypointUrl } from './entrypoints.js';

export function createBrowserWorkbenchCapabilityDiagnostics(
  userConfig: ResolvedUserConfig,
): (request: WorkbenchCapabilityReportRequest) => Promise<RuntimeRunInspectionBrowserDiagnosticsSummary | null> {
  return async (request) => {
    if (request.diagnostics !== 'browser-state') {
      return null;
    }
    if (!request.provider) {
      return createUnavailableWorkbenchBrowserDiagnostics({
        reason: 'workbench browser diagnostics require a provider filter',
      });
    }

    const observed = await probeBrowserRunDiagnostics(userConfig, {
      service: request.provider,
      runId: 'workbench-capabilities',
      stepId: `workbench-capabilities-${request.provider}`,
      configuredUrl: resolveWorkbenchCapabilityEntrypointUrl(request),
    });

    if (!observed) {
      return createUnavailableWorkbenchBrowserDiagnostics({
        service: request.provider,
        ownerStepId: `workbench-capabilities-${request.provider}`,
        reason: `browser diagnostics probe returned no live state for ${request.provider}`,
      });
    }

    return {
      probeStatus: 'observed',
      service: observed.service ?? request.provider,
      ownerStepId: observed.ownerStepId ?? `workbench-capabilities-${request.provider}`,
      observedAt: observed.observedAt,
      source: observed.source,
      reason: null,
      target: observed.target,
      document: observed.document,
      visibleCounts: observed.visibleCounts,
      providerEvidence: observed.providerEvidence ?? null,
      browserMutations: observed.browserMutations ?? null,
      browserOperationQueue: observed.browserOperationQueue ?? null,
      screenshot: observed.screenshot ?? null,
    };
  };
}

function createUnavailableWorkbenchBrowserDiagnostics(input: {
  service?: WorkbenchCapabilityReportRequest['provider'];
  ownerStepId?: string | null;
  reason: string;
}): RuntimeRunInspectionBrowserDiagnosticsSummary {
  return {
    probeStatus: 'unavailable',
    service: input.service ?? null,
    ownerStepId: input.ownerStepId ?? null,
    observedAt: null,
    source: null,
    reason: input.reason,
    target: null,
    document: null,
    visibleCounts: null,
    providerEvidence: null,
    browserOperationQueue: null,
    screenshot: null,
  };
}
