import type { RuntimeRunInspectionBrowserDiagnosticsSummary } from '../runtime/inspection.js';
import type { WorkbenchCapabilityEntrypoint } from './entrypoints.js';

export type WorkbenchCapabilityProvider = 'chatgpt' | 'gemini' | 'grok';

export type WorkbenchCapabilityCategory =
  | 'research'
  | 'media'
  | 'canvas'
  | 'connector'
  | 'skill'
  | 'app'
  | 'search'
  | 'file'
  | 'other';

export type WorkbenchCapabilityInvocationMode =
  | 'pre_prompt_toggle'
  | 'tool_drawer_selection'
  | 'composer_attachment'
  | 'provider_api'
  | 'post_prompt_action'
  | 'unknown';

export type WorkbenchCapabilitySurface =
  | 'cli'
  | 'local_api'
  | 'mcp'
  | 'browser_service'
  | 'provider_api';

export type WorkbenchCapabilityAvailability =
  | 'available'
  | 'not_visible'
  | 'account_gated'
  | 'human_verification_required'
  | 'blocked'
  | 'unknown';

export type WorkbenchCapabilityStability =
  | 'stable'
  | 'experimental'
  | 'observed'
  | 'deprecated';

export interface WorkbenchCapabilityInputSpec {
  name: string;
  required: boolean;
  description?: string | null;
}

export interface WorkbenchCapabilityOutputSpec {
  artifactTypes?: string[];
  description?: string | null;
}

export interface WorkbenchCapabilitySafety {
  requiresUserConsent?: boolean;
  maySpendCredits?: boolean;
  mayUseExternalAccount?: boolean;
  mayTakeMinutes?: boolean;
  notes?: string[];
}

export interface WorkbenchCapability {
  id: string;
  provider: WorkbenchCapabilityProvider;
  providerLabels: string[];
  category: WorkbenchCapabilityCategory;
  invocationMode: WorkbenchCapabilityInvocationMode;
  surfaces: WorkbenchCapabilitySurface[];
  availability: WorkbenchCapabilityAvailability;
  stability: WorkbenchCapabilityStability;
  requiredInputs: WorkbenchCapabilityInputSpec[];
  output: WorkbenchCapabilityOutputSpec;
  safety: WorkbenchCapabilitySafety;
  observedAt?: string | null;
  source: 'static_catalog' | 'browser_discovery' | 'provider_api' | 'test_fixture';
  metadata?: Record<string, unknown> | null;
}

export interface WorkbenchCapabilityReportRequest {
  provider?: WorkbenchCapabilityProvider | null;
  category?: WorkbenchCapabilityCategory | null;
  runtimeProfile?: string | null;
  includeUnavailable?: boolean | null;
  diagnostics?: 'browser-state' | null;
  entrypoint?: WorkbenchCapabilityEntrypoint | null;
}

export interface WorkbenchCapabilityReport {
  object: 'workbench_capability_report';
  generatedAt: string;
  provider?: WorkbenchCapabilityProvider | null;
  category?: WorkbenchCapabilityCategory | null;
  runtimeProfile?: string | null;
  browserDiagnostics?: RuntimeRunInspectionBrowserDiagnosticsSummary | null;
  capabilities: WorkbenchCapability[];
  summary: {
    total: number;
    available: number;
    accountGated: number;
    unknown: number;
    blocked: number;
  };
}

export interface WorkbenchCapabilityReporter {
  listCapabilities(request?: WorkbenchCapabilityReportRequest): Promise<WorkbenchCapabilityReport>;
}
