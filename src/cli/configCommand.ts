import type { ResolvedUserConfig } from '../config.js';
import {
  analyzeConfigModelBridgeHealth,
  getBrowserProfiles,
  getCurrentRuntimeProfiles,
  getLegacyRuntimeProfiles,
  getPreferredRuntimeProfile,
  getPreferredRuntimeProfileName,
  projectConfigModel,
  getRuntimeProfileBrowserProfileId,
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
  bridgeKeys: {
    browserProfiles: 'browserFamilies';
    auracallRuntimeProfiles: 'profiles';
    runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily';
  };
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
  bridgeKeys: {
    browserProfiles: 'browserFamilies';
    auracallRuntimeProfiles: 'profiles';
    runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily';
  };
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
  const browserProfiles = getBrowserProfiles(input.rawConfig);
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(input.rawConfig);
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(input.rawConfig);
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
      browserProfiles: Object.keys(browserProfiles).sort(),
      auracallRuntimeProfiles: Object.keys(currentRuntimeProfiles).sort(),
      legacyRuntimeProfiles: Object.keys(legacyRuntimeProfiles).sort(),
    },
    bridgeKeys: {
      browserProfiles: 'browserFamilies',
      auracallRuntimeProfiles: 'profiles',
      runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
    },
    bridgeState: {
      browserProfilesPresent: Object.keys(browserProfiles).length > 0,
      auracallRuntimeProfilesPresent: Object.keys(currentRuntimeProfiles).length > 0,
      legacyRuntimeProfilesPresent: Object.keys(legacyRuntimeProfiles).length > 0,
    },
    projectedModel: projectConfigModel(input.rawConfig, {
      explicitProfileName: input.resolvedConfig.auracallProfile ?? null,
    }),
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
  const activeAuracallRuntimeProfile = getPreferredRuntimeProfileName(rawConfig, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  const browserProfiles = Object.keys(getBrowserProfiles(rawConfig)).sort();
  const runtimeProfiles = getCurrentRuntimeProfiles(rawConfig);
  const auracallRuntimeProfiles = Object.keys(runtimeProfiles)
    .sort()
    .map((name) => {
      const runtimeProfile = asRecord(runtimeProfiles[name]);
      return {
        name,
        active: name === activeAuracallRuntimeProfile,
        browserProfile: getRuntimeProfileBrowserProfileId(runtimeProfile),
        defaultService: asServiceId(runtimeProfile?.defaultService),
      };
    });
  return {
    activeAuracallRuntimeProfile,
    browserProfiles,
    auracallRuntimeProfiles,
    bridgeKeys: {
      browserProfiles: 'browserFamilies',
      auracallRuntimeProfiles: 'profiles',
      runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
    },
    projectedModel: projectConfigModel(rawConfig, {
      explicitProfileName: options.explicitProfileName ?? null,
    }),
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
