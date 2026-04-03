import type { ResolvedUserConfig } from '../config.js';
import {
  analyzeConfigModelBridgeHealth,
  inspectConfigModel,
  getPreferredRuntimeProfile,
  getPreferredRuntimeProfileName,
  getRuntimeProfileBrowserProfileId,
  type ConfigModelBridgeKeys,
  type ConfigModelInspection,
  type ConfigModelDoctorIssue,
  type ConfigModelDoctorReport,
  type ProjectedConfigModel,
} from '../config/model.js';

type MutableRecord = Record<string, unknown>;

export interface ConfigShowReport {
  configPath: string;
  loaded: boolean;
  active: {
    auracallRuntimeProfile: string | null;
    browserProfile: string | null;
    defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
    resolvedBrowserTarget: 'chatgpt' | 'gemini' | 'grok' | null;
  };
  available: {
    browserProfiles: string[];
    auracallRuntimeProfiles: string[];
    legacyRuntimeProfiles: string[];
  };
  bridgeKeys: ConfigModelBridgeKeys;
  bridgeState: {
    browserProfilesPresent: boolean;
    auracallRuntimeProfilesPresent: boolean;
    legacyRuntimeProfilesPresent: boolean;
  };
  projectedModel: ProjectedConfigModel;
}

export interface RuntimeProfileBridgeSummary {
  auracallRuntimeProfile: string | null;
  browserProfile: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProfileListEntry {
  name: string;
  active: boolean;
  browserProfile: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProfileListReport {
  activeAuracallRuntimeProfile: string | null;
  browserProfiles: string[];
  auracallRuntimeProfiles: ProfileListEntry[];
  bridgeKeys: ConfigModelBridgeKeys;
  projectedModel: ProjectedConfigModel;
}

export type ConfigDoctorIssue = ConfigModelDoctorIssue;
export type ConfigDoctorReport = ConfigModelDoctorReport;

export function resolveConfigDoctorExitCode(
  report: ConfigDoctorReport,
  options: { strict?: boolean } = {},
): number {
  return options.strict && !report.ok ? 1 : 0;
}

function asRecord(value: unknown): MutableRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as MutableRecord) : null;
}

function asServiceId(value: unknown): 'chatgpt' | 'gemini' | 'grok' | null {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

export function buildConfigShowReport(input: {
  rawConfig: MutableRecord;
  resolvedConfig: ResolvedUserConfig;
  configPath: string;
  loaded: boolean;
}): ConfigShowReport {
  const inspection = inspectConfigModel(input.rawConfig, {
    explicitProfileName: input.resolvedConfig.auracallProfile ?? null,
  });
  const activeRuntimeProfile = getPreferredRuntimeProfile(input.rawConfig, {
    explicitProfileName: input.resolvedConfig.auracallProfile ?? null,
  });
  const activeRuntimeProfileRecord = asRecord(activeRuntimeProfile);

  return {
    configPath: input.configPath,
    loaded: input.loaded,
    active: {
      auracallRuntimeProfile: input.resolvedConfig.auracallProfile ?? null,
      browserProfile: getRuntimeProfileBrowserProfileId(activeRuntimeProfileRecord),
      defaultService: asServiceId(activeRuntimeProfileRecord?.defaultService),
      resolvedBrowserTarget: asServiceId(input.resolvedConfig.browser?.target),
    },
    available: {
      browserProfiles: inspection.browserProfileIds,
      auracallRuntimeProfiles: inspection.runtimeProfiles.map((profile) => profile.id),
      legacyRuntimeProfiles: inspection.legacyRuntimeProfileIds,
    },
    bridgeKeys: inspection.bridgeKeys,
    bridgeState: inspection.bridgeState,
    projectedModel: inspection.projectedModel,
  };
}

export function buildRuntimeProfileBridgeSummary(
  rawConfig: MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): RuntimeProfileBridgeSummary {
  const auracallRuntimeProfile = getPreferredRuntimeProfileName(rawConfig, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  const activeRuntimeProfile = getPreferredRuntimeProfile(rawConfig, {
    explicitProfileName: auracallRuntimeProfile,
  });
  const activeRuntimeProfileRecord = asRecord(activeRuntimeProfile);
  return {
    auracallRuntimeProfile,
    browserProfile: getRuntimeProfileBrowserProfileId(activeRuntimeProfileRecord),
    defaultService: asServiceId(activeRuntimeProfileRecord?.defaultService),
  };
}

export function buildProfileListReport(
  rawConfig: MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ProfileListReport {
  const inspection = inspectConfigModel(rawConfig, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  const auracallRuntimeProfiles = inspection.runtimeProfiles.map((runtimeProfile) => ({
    name: runtimeProfile.id,
    active: runtimeProfile.id === inspection.activeRuntimeProfileId,
    browserProfile: runtimeProfile.browserProfileId,
    defaultService: runtimeProfile.defaultService,
  }));
  return {
    activeAuracallRuntimeProfile: inspection.activeRuntimeProfileId,
    browserProfiles: inspection.browserProfileIds,
    auracallRuntimeProfiles,
    bridgeKeys: inspection.bridgeKeys,
    projectedModel: inspection.projectedModel,
  };
}

export function buildConfigDoctorReport(
  rawConfig: MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ConfigDoctorReport {
  return analyzeConfigModelBridgeHealth(rawConfig, options);
}

export function formatConfigShowReport(report: ConfigShowReport): string {
  const lines = [
    `Config path: ${report.configPath}`,
    `Loaded: ${report.loaded ? 'yes' : 'no'}`,
    `AuraCall runtime profile: ${report.active.auracallRuntimeProfile ?? '(none)'}`,
    `Browser profile: ${report.active.browserProfile ?? '(none)'}`,
    `Default service: ${report.active.defaultService ?? '(none)'}`,
    `Resolved browser target: ${report.active.resolvedBrowserTarget ?? '(none)'}`,
    `Available browser profiles: ${formatList(report.available.browserProfiles)}`,
    `Available AuraCall runtime profiles: ${formatList(report.available.auracallRuntimeProfiles)}`,
    `Legacy runtime profiles: ${formatList(report.available.legacyRuntimeProfiles)}`,
    'Bridge keys:',
    `  browser profiles -> ${report.bridgeKeys.browserProfiles} (${report.bridgeState.browserProfilesPresent ? 'present' : 'missing'})`,
    `  AuraCall runtime profiles -> ${report.bridgeKeys.auracallRuntimeProfiles} (${report.bridgeState.auracallRuntimeProfilesPresent ? 'present' : 'missing'})`,
    `  runtime -> browser profile -> ${report.bridgeKeys.runtimeProfileBrowserProfile}`,
    `  legacy runtime profiles present: ${report.bridgeState.legacyRuntimeProfilesPresent ? 'yes' : 'no'}`,
  ];
  return lines.join('\n');
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}

export function formatRuntimeProfileBridgeSummary(summary: RuntimeProfileBridgeSummary): string {
  return [
    `AuraCall runtime profile "${summary.auracallRuntimeProfile ?? '(none)'}"`,
    `browser profile "${summary.browserProfile ?? '(none)'}"`,
    `default service ${summary.defaultService ?? '(none)'}`,
  ].join(' -> ');
}

export function formatProfileListReport(report: ProfileListReport): string {
  const lines = [
    `Active AuraCall runtime profile: ${report.activeAuracallRuntimeProfile ?? '(none)'}`,
    `Available browser profiles: ${formatList(report.browserProfiles)}`,
    `AuraCall runtime profiles (${report.bridgeKeys.auracallRuntimeProfiles}):`,
  ];
  if (report.auracallRuntimeProfiles.length === 0) {
    lines.push('  (none)');
    return lines.join('\n');
  }
  for (const entry of report.auracallRuntimeProfiles) {
    lines.push(
      `  ${entry.active ? '*' : '-'} ${entry.name} -> browser profile ${entry.browserProfile ?? '(none)'} -> default service ${entry.defaultService ?? '(none)'}`,
    );
  }
  return lines.join('\n');
}

export function formatConfigDoctorReport(report: ConfigDoctorReport): string {
  const lines = [
    `Active AuraCall runtime profile: ${report.activeAuracallRuntimeProfile ?? '(none)'}`,
    `Active browser profile: ${report.activeBrowserProfile ?? '(none)'}`,
    `Status: ${report.ok ? 'ok' : 'warnings'}`,
  ];
  if (report.issues.length === 0) {
    lines.push('Issues: (none)');
    return lines.join('\n');
  }
  lines.push('Issues:');
  for (const issue of report.issues) {
    lines.push(`  - [${issue.severity}] ${issue.message}`);
  }
  return lines.join('\n');
}
