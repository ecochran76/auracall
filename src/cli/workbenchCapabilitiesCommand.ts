import type {
  WorkbenchCapabilityCategory,
  WorkbenchCapabilityDiscoveryAction,
  WorkbenchCapabilityProvider,
  WorkbenchCapabilityReport,
  WorkbenchCapabilityReportRequest,
  WorkbenchCapabilityReporter,
} from '../workbench/types.js';
import { normalizeWorkbenchCapabilityEntrypoint } from '../workbench/entrypoints.js';

export const WORKBENCH_CAPABILITY_PROVIDERS: WorkbenchCapabilityProvider[] = ['chatgpt', 'gemini', 'grok'];

export const WORKBENCH_CAPABILITY_CATEGORIES: WorkbenchCapabilityCategory[] = [
  'research',
  'media',
  'canvas',
  'connector',
  'skill',
  'app',
  'search',
  'file',
  'other',
];

export interface WorkbenchCapabilitiesCliOptions {
  target?: unknown;
  provider?: unknown;
  category?: unknown;
  availableOnly?: unknown;
  runtimeProfile?: unknown;
  diagnostics?: unknown;
  entrypoint?: unknown;
  discoveryAction?: unknown;
}

export function normalizeWorkbenchCapabilityProvider(value: unknown): WorkbenchCapabilityProvider | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (WORKBENCH_CAPABILITY_PROVIDERS.includes(normalized as WorkbenchCapabilityProvider)) {
    return normalized as WorkbenchCapabilityProvider;
  }
  throw new Error(`Invalid provider "${value}". Use "chatgpt", "gemini", or "grok".`);
}

export function normalizeWorkbenchCapabilityCategory(value: unknown): WorkbenchCapabilityCategory | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (WORKBENCH_CAPABILITY_CATEGORIES.includes(normalized as WorkbenchCapabilityCategory)) {
    return normalized as WorkbenchCapabilityCategory;
  }
  throw new Error(`Invalid category "${value}". Use one of: ${WORKBENCH_CAPABILITY_CATEGORIES.join(', ')}.`);
}

export function normalizeWorkbenchCapabilityDiagnostics(value: unknown): 'browser-state' | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'browser-state') return normalized;
  throw new Error(`Invalid diagnostics "${value}". Use "browser-state".`);
}

export function normalizeWorkbenchCapabilityDiscoveryAction(value: unknown): WorkbenchCapabilityDiscoveryAction | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'grok-imagine-video-mode') return 'grok-imagine-video-mode';
  throw new Error(`Invalid discovery action "${value}". Use "grok-imagine-video-mode".`);
}

export async function buildWorkbenchCapabilityReportForCli(
  reporter: WorkbenchCapabilityReporter,
  options: WorkbenchCapabilitiesCliOptions = {},
): Promise<WorkbenchCapabilityReport> {
  const provider = normalizeWorkbenchCapabilityProvider(options.provider ?? options.target);
  const category = normalizeWorkbenchCapabilityCategory(options.category);
  const runtimeProfile =
    typeof options.runtimeProfile === 'string' && options.runtimeProfile.trim().length > 0
      ? options.runtimeProfile.trim()
      : null;
  const request: WorkbenchCapabilityReportRequest = {
    provider,
    category,
    runtimeProfile,
    includeUnavailable: !options.availableOnly,
    diagnostics: normalizeWorkbenchCapabilityDiagnostics(options.diagnostics),
    entrypoint: normalizeWorkbenchCapabilityEntrypoint(options.entrypoint),
    discoveryAction: normalizeWorkbenchCapabilityDiscoveryAction(options.discoveryAction),
  };
  return reporter.listCapabilities(request);
}

export function formatWorkbenchCapabilityReport(report: WorkbenchCapabilityReport): string {
  const scope = [
    report.provider ? `provider ${report.provider}` : null,
    report.category ? `category ${report.category}` : null,
    report.runtimeProfile ? `AuraCall runtime profile ${report.runtimeProfile}` : null,
  ].filter(Boolean);
  const lines = [
    `Workbench capabilities${scope.length > 0 ? ` (${scope.join(', ')})` : ''}`,
    `Generated: ${report.generatedAt}`,
    `Summary: ${report.summary.total} total, ${report.summary.available} available, ${report.summary.accountGated} account-gated, ${report.summary.unknown} unknown, ${report.summary.blocked} blocked`,
  ];

  if (report.capabilities.length === 0) {
    lines.push('No capabilities matched the requested filters.');
  }

  if (report.browserDiagnostics) {
    lines.push(formatBrowserDiagnostics(report.browserDiagnostics));
  }

  if (report.capabilities.length > 0) {
    for (const capability of report.capabilities) {
      const labels = capability.providerLabels.length > 0 ? `: ${capability.providerLabels.join(', ')}` : '';
      lines.push(
        `- ${capability.id} [${capability.category}] ${capability.availability} via ${capability.invocationMode} (${capability.source})${labels}`,
      );
      const outputs = capability.output.artifactTypes?.length ? capability.output.artifactTypes.join(', ') : 'generated';
      lines.push(`  output: ${outputs}; surfaces: ${capability.surfaces.join(', ')}`);
      const safety = formatSafetyNotes(capability.safety);
      if (safety) {
        lines.push(`  safety: ${safety}`);
      }
    }
  }

  return lines.join('\n');
}

function formatBrowserDiagnostics(
  diagnostics: NonNullable<WorkbenchCapabilityReport['browserDiagnostics']>,
): string {
  if (diagnostics.probeStatus !== 'observed') {
    return `Browser diagnostics: unavailable (${diagnostics.reason ?? 'no reason reported'})`;
  }
  const lines = [
    `Browser diagnostics: observed ${diagnostics.service ?? '(unknown service)'}`,
    `  target: ${diagnostics.target?.url ?? '(none)'}`,
    `  document: ${diagnostics.document?.title ?? '(untitled)'}; ready=${diagnostics.document?.readyState ?? '(unknown)'}`,
  ];
  if (diagnostics.screenshot) {
    lines.push(`  screenshot: ${diagnostics.screenshot.path} (${diagnostics.screenshot.bytes} bytes)`);
  }
  if (diagnostics.providerEvidence) {
    lines.push(`  provider evidence: ${JSON.stringify(diagnostics.providerEvidence)}`);
  }
  return lines.join('\n');
}

function formatSafetyNotes(safety: WorkbenchCapabilityReport['capabilities'][number]['safety']): string | null {
  const notes = [
    safety.requiresUserConsent ? 'requires user consent' : null,
    safety.maySpendCredits ? 'may spend credits' : null,
    safety.mayUseExternalAccount ? 'may use an external account' : null,
    safety.mayTakeMinutes ? 'may take minutes' : null,
    ...(safety.notes ?? []),
  ].filter(Boolean);
  return notes.length > 0 ? notes.join('; ') : null;
}
