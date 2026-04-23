import type { ResolvedUserConfig } from '../config.js';
import { resolveConfig } from '../schema/resolver.js';
import {
  probeBrowserRunDiagnostics,
  type BrowserDiagnosticsService,
} from '../browser/liveDiagnostics.js';
import type {
  RuntimeRunInspectionBrowserDiagnosticsProbeResult,
  RuntimeRunInspectionBrowserDiagnosticsSummary,
} from '../runtime/inspection.js';
import type { MediaGenerationResponse, MediaGenerationTimelineEvent } from './types.js';

type MediaBrowserDiagnosticsDeps = {
  resolveConfigImpl?: typeof resolveConfig;
  probeBrowserRunDiagnosticsImpl?: typeof probeBrowserRunDiagnostics;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export async function probeMediaGenerationBrowserDiagnostics(
  response: MediaGenerationResponse,
  deps: MediaBrowserDiagnosticsDeps = {},
): Promise<RuntimeRunInspectionBrowserDiagnosticsSummary> {
  if (response.status !== 'running') {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      reason: `media generation ${response.id} is not actively running`,
    });
  }

  if (response.provider !== 'gemini' && response.provider !== 'grok') {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      reason: `media generation ${response.id} uses provider ${response.provider}, which has no browser diagnostics probe`,
    });
  }

  const metadata = response.metadata ?? {};
  if (metadata.transport !== 'browser') {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      reason: `media generation ${response.id} is not using browser transport`,
    });
  }

  const runtimeProfile = stringOrNull(metadata.runtimeProfile);
  const resolvedConfig = await (deps.resolveConfigImpl ?? resolveConfig)(
    runtimeProfile ? { profile: runtimeProfile } : {},
    deps.cwd ?? process.cwd(),
    deps.env ?? process.env,
  );
  if (runtimeProfile && resolvedConfig.auracallProfile !== runtimeProfile) {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      reason: `media generation ${response.id} runtime profile ${runtimeProfile} did not resolve to the active AuraCall runtime profile`,
    });
  }
  if (resolvedConfig.engine !== 'browser') {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      reason: `media generation ${response.id} resolved a non-browser AuraCall runtime profile`,
    });
  }

  const tabTargetId = resolveTabTargetId(response);
  if (!tabTargetId) {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      ownerStepId: `${response.id}:media`,
      reason: `media generation ${response.id} has no browser tab target yet`,
    });
  }

  const observed = await (deps.probeBrowserRunDiagnosticsImpl ?? probeBrowserRunDiagnostics)(
    resolvedConfig as ResolvedUserConfig,
    {
      service: response.provider as BrowserDiagnosticsService,
      runId: response.id,
      stepId: `${response.id}:media`,
      preferredTargetId: tabTargetId,
    },
  );
  if (!observed) {
    return createUnavailableMediaBrowserDiagnostics({
      service: response.provider,
      ownerStepId: `${response.id}:media`,
      reason: `browser diagnostics probe returned no live state for media generation ${response.id}`,
    });
  }

  return formatObservedMediaBrowserDiagnostics(observed, response);
}

function formatObservedMediaBrowserDiagnostics(
  observed: RuntimeRunInspectionBrowserDiagnosticsProbeResult,
  response: MediaGenerationResponse,
): RuntimeRunInspectionBrowserDiagnosticsSummary {
  return {
    probeStatus: 'observed',
    service: observed.service ?? response.provider,
    ownerStepId: observed.ownerStepId ?? `${response.id}:media`,
    observedAt: observed.observedAt,
    source: observed.source,
    reason: null,
    target: observed.target,
    document: observed.document,
    visibleCounts: observed.visibleCounts,
    providerEvidence: observed.providerEvidence ?? null,
    browserMutations: observed.browserMutations ?? null,
    screenshot: observed.screenshot ?? null,
  };
}

function createUnavailableMediaBrowserDiagnostics(input: {
  service?: string | null;
  ownerStepId?: string | null;
  reason: string;
}): RuntimeRunInspectionBrowserDiagnosticsSummary {
  return {
    probeStatus: 'unavailable',
    service: input.service === 'gemini' || input.service === 'grok' ? input.service : null,
    ownerStepId: input.ownerStepId ?? null,
    observedAt: null,
    source: null,
    reason: input.reason,
    target: null,
    document: null,
    visibleCounts: null,
    providerEvidence: null,
    screenshot: null,
  };
}

function resolveTabTargetId(response: MediaGenerationResponse): string | null {
  return (
    stringOrNull(response.metadata?.tabTargetId) ??
    stringOrNull(readTimelineDetail(response.timeline, 'tabTargetId')) ??
    stringOrNull(readTimelineDetail(response.timeline, 'targetId'))
  );
}

function readTimelineDetail(
  timeline: MediaGenerationTimelineEvent[] | undefined,
  key: string,
): unknown {
  for (const event of [...(timeline ?? [])].reverse()) {
    const details = event.details;
    if (details && typeof details === 'object' && key in details) {
      return details[key];
    }
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
