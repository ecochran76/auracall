import type { OracleConfig } from './schema.js';
import type { LocalActionExecutionPolicy } from '../runtime/localActions.js';
import { resolveManagedProfileDir } from '../browser/profileStore.js';
import path from 'node:path';

type MutableRecord = Record<string, unknown>;
type MutableBrowserProfile = Record<string, unknown>;
type MutableRuntimeProfile = Record<string, unknown>;
type MutableAgent = Record<string, unknown>;
type MutableTeam = Record<string, unknown>;

export interface ProjectedBrowserProfile {
  id: string;
}

export interface ProjectedRuntimeProfile {
  id: string;
  browserProfileId: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProjectedAgent {
  id: string;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProjectedTeamMember {
  agentId: string;
  exists: boolean;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ProjectedTeam {
  id: string;
  agentIds: string[];
  members: ProjectedTeamMember[];
}

export interface ResolvedAgentSelection {
  agentId: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
  exists: boolean;
}

export interface ResolvedTeamMemberSelection extends ResolvedAgentSelection {}

export interface ResolvedTeamSelection {
  teamId: string | null;
  agentIds: string[];
  members: ResolvedTeamMemberSelection[];
  exists: boolean;
}

export interface ResolvedRuntimeSelection {
  agent: ResolvedAgentSelection | null;
  runtimeProfileId: string | null;
  runtimeProfile: MutableRuntimeProfile | null;
  browserProfileId: string | null;
  browserProfile: MutableBrowserProfile | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface ResolvedTeamRuntimeMemberSelection extends ResolvedRuntimeSelection {
  agentId: string | null;
  exists: boolean;
}

export interface ResolvedTeamRuntimeSelections {
  teamId: string | null;
  agentIds: string[];
  members: ResolvedTeamRuntimeMemberSelection[];
  exists: boolean;
}

export interface RuntimeSelectionPolicy {
  runtimeSelectorPrecedence: ['profile', 'agent', 'config'];
  planningOnlySelectors: ['team'];
  activeRuntimeSelector: 'profile' | 'agent' | 'config';
  teamSelectionAffectsRuntime: false;
}

export interface ProjectedConfigModel {
  activeRuntimeProfileId: string | null;
  activeBrowserProfileId: string | null;
  browserProfiles: ProjectedBrowserProfile[];
  runtimeProfiles: ProjectedRuntimeProfile[];
  agents: ProjectedAgent[];
  teams: ProjectedTeam[];
}

export interface ConfigModelBridgeKeys {
  browserProfiles: 'browserFamilies';
  auracallRuntimeProfiles: 'profiles';
  runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily';
}

export interface ConfigModelInspection {
  activeRuntimeProfileId: string | null;
  activeBrowserProfileId: string | null;
  activeDefaultService: 'chatgpt' | 'gemini' | 'grok' | null;
  browserProfileIds: string[];
  runtimeProfiles: ProjectedRuntimeProfile[];
  agentIds: string[];
  teamIds: string[];
  legacyRuntimeProfileIds: string[];
  targetState: {
    browserProfilesPresent: boolean;
    runtimeProfilesPresent: boolean;
  };
  bridgeState: {
    browserProfilesPresent: boolean;
    auracallRuntimeProfilesPresent: boolean;
    legacyRuntimeProfilesPresent: boolean;
  };
  bridgeKeys: ConfigModelBridgeKeys;
  projectedModel: ProjectedConfigModel;
}

export interface ConfigModelDoctorIssue {
  code:
    | 'no-runtime-profiles'
    | 'legacy-runtime-profiles-present'
    | 'mixed-browser-profile-keys'
    | 'mixed-runtime-profile-keys'
    | 'global-browser-service-scoped-defaults-present'
    | 'llm-defaults-service-scoped-defaults-present'
    | 'conflicting-browser-profile-definitions'
    | 'browser-profile-service-scoped-overrides-present'
    | 'conflicting-runtime-profile-definitions'
    | 'mixed-runtime-profile-browser-reference'
    | 'runtime-profile-missing-browser-profile'
    | 'runtime-profile-browser-profile-missing'
    | 'runtime-profile-browser-owned-overrides-present'
    | 'runtime-profile-service-scoped-overrides-relocatable-present'
    | 'runtime-profile-service-scoped-escape-hatches-present'
    | 'runtime-profile-manual-login-profile-dir-redundant'
    | 'runtime-profile-service-defaults-redundant'
    | 'unused-browser-profile'
    | 'active-runtime-profile-missing-browser-profile'
    | 'agent-missing-runtime-profile'
    | 'agent-runtime-profile-missing'
    | 'team-agent-missing';
  severity: 'warning' | 'info';
  message: string;
  auracallRuntimeProfile?: string;
  browserProfile?: string;
  agent?: string;
  team?: string;
}

export interface ConfigModelDoctorReport {
  ok: boolean;
  activeAuracallRuntimeProfile: string | null;
  activeBrowserProfile: string | null;
  targetState: {
    browserProfilesPresent: boolean;
    runtimeProfilesPresent: boolean;
  };
  precedence: {
    browserProfiles: 'target' | 'bridge';
    runtimeProfiles: 'target' | 'bridge';
    runtimeProfileBrowserProfileReference: 'target' | 'bridge';
  };
  issueCount: number;
  issues: ConfigModelDoctorIssue[];
}

export const CONFIG_MODEL_BRIDGE_KEYS: ConfigModelBridgeKeys = {
  browserProfiles: 'browserFamilies',
  auracallRuntimeProfiles: 'profiles',
  runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
};

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const RUNTIME_BROWSER_OWNED_OVERRIDE_KEYS = new Set([
  'chromePath',
  'display',
  'managedProfileRoot',
  'sourceProfilePath',
  'sourceProfileName',
  'sourceCookiePath',
  'bootstrapCookiePath',
  'debugPort',
  'debugPortStrategy',
  'debugPortRange',
  'blockingProfileAction',
  'wslChromePreference',
  'serviceTabLimit',
  'blankTabLimit',
  'collapseDisposableWindows',
  'headless',
  'hideWindow',
  'remoteChrome',
]);
const RUNTIME_SERVICE_SCOPED_RELOCATABLE_KEYS = new Set(['modelStrategy', 'thinkingTime', 'composerTool']);
const RUNTIME_SERVICE_SCOPED_ESCAPE_HATCH_KEYS = new Set(['manualLogin', 'manualLoginProfileDir']);

function describeGlobalBrowserServiceScopedDefaults(config: OracleConfig | MutableRecord): string[] {
  const globalBrowser = isRecord((config as MutableRecord).browser) ? ((config as MutableRecord).browser as MutableRecord) : {};
  return Object.keys(globalBrowser)
    .filter(
      (key) =>
        RUNTIME_SERVICE_SCOPED_RELOCATABLE_KEYS.has(key) ||
        key === 'projectName' ||
        key === 'projectId' ||
        key === 'conversationId' ||
        key === 'conversationName',
    )
    .map((key) => `browser.${key}`);
}

function describeLlmDefaultsServiceScopedDefaults(config: OracleConfig | MutableRecord): string[] {
  const llmDefaults = isRecord((config as MutableRecord).llmDefaults) ? ((config as MutableRecord).llmDefaults as MutableRecord) : {};
  const keys: string[] = [];
  if (llmDefaults.modelStrategy !== undefined) {
    keys.push('llmDefaults.modelStrategy');
  }
  if (llmDefaults.defaultProjectName !== undefined) {
    keys.push('llmDefaults.defaultProjectName');
  }
  if (llmDefaults.defaultProjectId !== undefined) {
    keys.push('llmDefaults.defaultProjectId');
  }
  return keys;
}

function describeBrowserProfileServiceScopedOverrides(browserProfile: MutableBrowserProfile): string[] {
  return Object.keys(browserProfile)
    .filter((key) => RUNTIME_SERVICE_SCOPED_RELOCATABLE_KEYS.has(key))
    .map((key) => key);
}

function describeRuntimeProfileBrowserOwnedOverrides(runtimeProfile: MutableRuntimeProfile): string[] {
  const present: string[] = [];
  if (isRecord(runtimeProfile.browser)) {
    const browserOwnedKeys = Object.keys(runtimeProfile.browser).filter((key) =>
      RUNTIME_BROWSER_OWNED_OVERRIDE_KEYS.has(key),
    );
    if (browserOwnedKeys.length > 0) {
      present.push(...browserOwnedKeys.map((key) => `browser.${key}`));
    }
  }
  if (typeof runtimeProfile.keepBrowser === 'boolean') {
    present.push('keepBrowser');
  }
  return present;
}

function describeRuntimeProfileRelocatableServiceOverrides(runtimeProfile: MutableRuntimeProfile): string[] {
  if (!isRecord(runtimeProfile.browser)) {
    return [];
  }
  return Object.keys(runtimeProfile.browser)
    .filter((key) => RUNTIME_SERVICE_SCOPED_RELOCATABLE_KEYS.has(key))
    .map((key) => `browser.${key}`);
}

function describeRuntimeProfileServiceScopedEscapeHatches(runtimeProfile: MutableRuntimeProfile): string[] {
  if (!isRecord(runtimeProfile.browser)) {
    return [];
  }
  return Object.keys(runtimeProfile.browser)
    .filter((key) => RUNTIME_SERVICE_SCOPED_ESCAPE_HATCH_KEYS.has(key))
    .map((key) => `browser.${key}`);
}

function describeRedundantManagedProfileDirOverrides(
  config: OracleConfig | MutableRecord,
  runtimeProfileName: string,
  runtimeProfile: MutableRuntimeProfile,
): string[] {
  const browserProfile = getRuntimeProfileBrowserProfile(config, runtimeProfile);
  const runtimeBrowser = isRecord(runtimeProfile.browser) ? runtimeProfile.browser : {};
  const globalBrowser = isRecord((config as MutableRecord).browser) ? ((config as MutableRecord).browser as MutableRecord) : {};
  const managedProfileRoot =
    (typeof runtimeBrowser.managedProfileRoot === 'string' && runtimeBrowser.managedProfileRoot.trim().length > 0
      ? runtimeBrowser.managedProfileRoot
      : null) ??
    (browserProfile && typeof browserProfile.managedProfileRoot === 'string' && browserProfile.managedProfileRoot.trim().length > 0
      ? browserProfile.managedProfileRoot
      : null) ??
    (typeof globalBrowser.managedProfileRoot === 'string' && globalBrowser.managedProfileRoot.trim().length > 0
      ? globalBrowser.managedProfileRoot
      : null);

  const redundant: string[] = [];
  const runtimeBrowserManualLoginProfileDir =
    typeof runtimeBrowser.manualLoginProfileDir === 'string' && runtimeBrowser.manualLoginProfileDir.trim().length > 0
      ? runtimeBrowser.manualLoginProfileDir.trim()
      : null;
  const defaultService = asServiceId(runtimeProfile.defaultService);
  if (runtimeBrowserManualLoginProfileDir && defaultService) {
    const expected = resolveManagedProfileDir({
      configuredDir: null,
      managedProfileRoot,
      auracallProfileName: runtimeProfileName,
      target: defaultService,
    });
    if (path.resolve(runtimeBrowserManualLoginProfileDir) === path.resolve(expected)) {
      redundant.push(`browser.manualLoginProfileDir (${defaultService})`);
    }
  }

  const profileServices = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
  for (const serviceId of ['chatgpt', 'gemini', 'grok'] as const) {
    const serviceConfig = isRecord(profileServices[serviceId]) ? profileServices[serviceId] : null;
    if (!serviceConfig) continue;
    const manualLoginProfileDir =
      typeof serviceConfig.manualLoginProfileDir === 'string' && serviceConfig.manualLoginProfileDir.trim().length > 0
        ? serviceConfig.manualLoginProfileDir.trim()
        : null;
    if (!manualLoginProfileDir) continue;
    const expected = resolveManagedProfileDir({
      configuredDir: null,
      managedProfileRoot,
      auracallProfileName: runtimeProfileName,
      target: serviceId,
    });
    if (path.resolve(manualLoginProfileDir) === path.resolve(expected)) {
      redundant.push(`services.${serviceId}.manualLoginProfileDir`);
    }
  }

  return redundant;
}

function describeRedundantRuntimeProfileServiceDefaults(
  config: OracleConfig | MutableRecord,
  runtimeProfile: MutableRuntimeProfile,
): string[] {
  const globalServices = isRecord((config as MutableRecord).services) ? ((config as MutableRecord).services as MutableRecord) : {};
  const runtimeServices = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
  const redundant: string[] = [];

  for (const serviceId of ['chatgpt', 'gemini', 'grok'] as const) {
    const globalService = isRecord(globalServices[serviceId]) ? (globalServices[serviceId] as MutableRecord) : null;
    const runtimeService = isRecord(runtimeServices[serviceId]) ? (runtimeServices[serviceId] as MutableRecord) : null;
    if (!globalService || !runtimeService) continue;

    for (const key of RUNTIME_SERVICE_SCOPED_RELOCATABLE_KEYS) {
      if (runtimeService[key] === undefined || globalService[key] === undefined) continue;
      if (areEquivalentRecords(runtimeService[key], globalService[key])) {
        redundant.push(`services.${serviceId}.${key}`);
      }
    }
  }

  return redundant;
}

function asServiceId(value: unknown): 'chatgpt' | 'gemini' | 'grok' | null {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJsonValue(value[key]);
      return acc;
    }, {});
}

function areEquivalentRecords(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right));
}

function getTargetBrowserProfiles(config: OracleConfig | MutableRecord): Record<string, MutableBrowserProfile> {
  return isRecord((config as MutableRecord).browserProfiles)
    ? ((config as MutableRecord).browserProfiles as Record<string, MutableBrowserProfile>)
    : {};
}

export function getBrowserProfiles(config: OracleConfig | MutableRecord): Record<string, MutableBrowserProfile> {
  const targetProfiles = getTargetBrowserProfiles(config);
  return Object.keys(targetProfiles).length > 0
    ? targetProfiles
    : isRecord(config.browserFamilies)
      ? (config.browserFamilies as Record<string, MutableBrowserProfile>)
      : {};
}

export function getBrowserProfile(
  config: OracleConfig | MutableRecord,
  browserProfileName: string | null | undefined,
): MutableBrowserProfile | null {
  const name =
    typeof browserProfileName === 'string' && browserProfileName.trim().length > 0
      ? browserProfileName.trim()
      : null;
  if (!name) return null;
  const browserProfiles = getBrowserProfiles(config);
  return isRecord(browserProfiles[name]) ? browserProfiles[name] : null;
}

export function getRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return isRecord(config.profiles) ? (config.profiles as Record<string, MutableRuntimeProfile>) : {};
}

export function getTargetRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return isRecord((config as MutableRecord).runtimeProfiles)
    ? ((config as MutableRecord).runtimeProfiles as Record<string, MutableRuntimeProfile>)
    : {};
}

export function getCurrentRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  const targetProfiles = getTargetRuntimeProfiles(config);
  return Object.keys(targetProfiles).length > 0 ? targetProfiles : getRuntimeProfiles(config);
}

export function getAgents(config: OracleConfig | MutableRecord): Record<string, MutableAgent> {
  return isRecord((config as MutableRecord).agents)
    ? ((config as MutableRecord).agents as Record<string, MutableAgent>)
    : {};
}

export function getTeams(config: OracleConfig | MutableRecord): Record<string, MutableTeam> {
  return isRecord((config as MutableRecord).teams)
    ? ((config as MutableRecord).teams as Record<string, MutableTeam>)
    : {};
}

export function getAgent(
  config: OracleConfig | MutableRecord,
  agentId: string | null | undefined,
): MutableAgent | null {
  const name = typeof agentId === 'string' && agentId.trim().length > 0 ? agentId.trim() : null;
  if (!name) return null;
  const agents = getAgents(config);
  return isRecord(agents[name]) ? agents[name] : null;
}

export function getTeam(
  config: OracleConfig | MutableRecord,
  teamId: string | null | undefined,
): MutableTeam | null {
  const name = typeof teamId === 'string' && teamId.trim().length > 0 ? teamId.trim() : null;
  if (!name) return null;
  const teams = getTeams(config);
  return isRecord(teams[name]) ? teams[name] : null;
}

export function resolveHostLocalActionExecutionPolicy(
  config: OracleConfig | MutableRecord,
): Partial<LocalActionExecutionPolicy> {
  const runtime = isRecord((config as MutableRecord).runtime)
    ? ((config as MutableRecord).runtime as MutableRecord)
    : null;
  const localActions = runtime && isRecord(runtime.localActions) ? (runtime.localActions as MutableRecord) : null;
  const shell = localActions && isRecord(localActions.shell) ? (localActions.shell as MutableRecord) : null;
  if (!shell) {
    return {};
  }

  return {
    complexityStage:
      shell.complexityStage === 'bounded-command' ||
      shell.complexityStage === 'repo-automation' ||
      shell.complexityStage === 'extended'
        ? shell.complexityStage
        : undefined,
    allowedShellCommands: Array.isArray(shell.allowedCommands)
      ? shell.allowedCommands.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : undefined,
    allowedCwdRoots: Array.isArray(shell.allowedCwdRoots)
      ? shell.allowedCwdRoots.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : undefined,
    defaultShellActionTimeoutMs:
      typeof shell.defaultShellActionTimeoutMs === 'number' && Number.isFinite(shell.defaultShellActionTimeoutMs)
        ? shell.defaultShellActionTimeoutMs
        : undefined,
    maxShellActionTimeoutMs:
      typeof shell.maxShellActionTimeoutMs === 'number' && Number.isFinite(shell.maxShellActionTimeoutMs)
        ? shell.maxShellActionTimeoutMs
        : undefined,
    maxCaptureChars:
      typeof shell.maxCaptureChars === 'number' && Number.isFinite(shell.maxCaptureChars)
        ? Math.trunc(shell.maxCaptureChars)
        : undefined,
  };
}

export function getLegacyRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  return isRecord(config.auracallProfiles)
    ? (config.auracallProfiles as Record<string, MutableRuntimeProfile>)
    : {};
}

export function getBridgeRuntimeProfiles(config: OracleConfig | MutableRecord): Record<string, MutableRuntimeProfile> {
  const legacyProfiles = getLegacyRuntimeProfiles(config);
  return Object.keys(legacyProfiles).length > 0 ? legacyProfiles : getCurrentRuntimeProfiles(config);
}

export function ensureBrowserProfiles(config: MutableRecord): Record<string, MutableBrowserProfile> {
  if (!isRecord(config.browserFamilies)) {
    config.browserFamilies = {};
  }
  return config.browserFamilies as Record<string, MutableBrowserProfile>;
}

export function ensureRuntimeProfiles(config: MutableRecord): Record<string, MutableRuntimeProfile> {
  if (!isRecord(config.profiles)) {
    config.profiles = {};
  }
  return config.profiles as Record<string, MutableRuntimeProfile>;
}

export function getRuntimeProfileBrowserProfileId(
  runtimeProfile: MutableRuntimeProfile | null | undefined,
): string | null {
  if (!isRecord(runtimeProfile)) return null;
  const value =
    typeof runtimeProfile.browserProfile === 'string' && runtimeProfile.browserProfile.trim().length > 0
      ? runtimeProfile.browserProfile
      : runtimeProfile.browserFamily;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getRuntimeProfileBrowserProfile(
  config: OracleConfig | MutableRecord,
  runtimeProfile: MutableRuntimeProfile | null | undefined,
): MutableBrowserProfile | null {
  return getBrowserProfile(config, getRuntimeProfileBrowserProfileId(runtimeProfile));
}

export function getAgentRuntimeProfileId(agent: MutableAgent | null | undefined): string | null {
  if (!isRecord(agent)) return null;
  return typeof agent.runtimeProfile === 'string' && agent.runtimeProfile.trim().length > 0 ? agent.runtimeProfile.trim() : null;
}

export function getAgentRuntimeProfile(
  config: OracleConfig | MutableRecord,
  agent: MutableAgent | null | undefined,
): MutableRuntimeProfile | null {
  const runtimeProfileId = getAgentRuntimeProfileId(agent);
  if (!runtimeProfileId) return null;
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  return isRecord(runtimeProfiles[runtimeProfileId]) ? runtimeProfiles[runtimeProfileId] : null;
}

export function resolveAgentSelection(
  config: OracleConfig | MutableRecord,
  agentId: string | null | undefined,
): ResolvedAgentSelection {
  const name = typeof agentId === 'string' && agentId.trim().length > 0 ? agentId.trim() : null;
  const agent = getAgent(config, name);
  const runtimeProfile = getAgentRuntimeProfile(config, agent);
  return {
    agentId: name,
    runtimeProfileId: getAgentRuntimeProfileId(agent),
    browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
    defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
    exists: agent !== null,
  };
}

export function resolveTeamSelection(
  config: OracleConfig | MutableRecord,
  teamId: string | null | undefined,
): ResolvedTeamSelection {
  const name = typeof teamId === 'string' && teamId.trim().length > 0 ? teamId.trim() : null;
  const team = getTeam(config, name);
  const agentIds =
    isRecord(team) && Array.isArray(team.agents)
      ? team.agents.filter((agentId): agentId is string => typeof agentId === 'string')
      : [];
  return {
    teamId: name,
    agentIds,
    members: agentIds.map((agentId) => resolveAgentSelection(config, agentId)),
    exists: team !== null,
  };
}

export function resolveRuntimeSelection(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null; explicitAgentId?: string | null } = {},
): ResolvedRuntimeSelection {
  const explicitAgentId =
    typeof options.explicitAgentId === 'string' && options.explicitAgentId.trim().length > 0
      ? options.explicitAgentId.trim()
      : null;
  const agent = explicitAgentId ? resolveAgentSelection(config, explicitAgentId) : null;
  const runtimeProfileId = getPreferredRuntimeProfileName(config, {
    explicitProfileName: options.explicitProfileName ?? null,
    explicitAgentId,
  });
  const runtimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: runtimeProfileId,
    explicitAgentId,
  });
  const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
  const browserProfile = getBrowserProfile(config, browserProfileId);
  return {
    agent,
    runtimeProfileId,
    runtimeProfile,
    browserProfileId,
    browserProfile,
    defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
  };
}

export function resolveTeamRuntimeSelections(
  config: OracleConfig | MutableRecord,
  teamId: string | null | undefined,
): ResolvedTeamRuntimeSelections {
  const teamSelection = resolveTeamSelection(config, teamId);
  return {
    teamId: teamSelection.teamId,
    agentIds: teamSelection.agentIds,
    members: teamSelection.members.map((agentSelection) => {
      const runtimeSelection = agentSelection.runtimeProfileId
        ? resolveRuntimeSelection(config, {
            explicitProfileName: agentSelection.runtimeProfileId,
            explicitAgentId: agentSelection.agentId,
          })
        : {
            agent: agentSelection,
            runtimeProfileId: null,
            runtimeProfile: null,
            browserProfileId: null,
            browserProfile: null,
            defaultService: null,
          };
      return {
        ...runtimeSelection,
        agentId: agentSelection.agentId,
        exists: agentSelection.exists,
      };
    }),
    exists: teamSelection.exists,
  };
}

export function resolveRuntimeSelectionPolicy(options: {
  explicitProfileName?: string | null;
  explicitAgentId?: string | null;
  explicitTeamId?: string | null;
} = {}): RuntimeSelectionPolicy {
  const explicitProfileName =
    typeof options.explicitProfileName === 'string' && options.explicitProfileName.trim().length > 0
      ? options.explicitProfileName.trim()
      : null;
  const explicitAgentId =
    typeof options.explicitAgentId === 'string' && options.explicitAgentId.trim().length > 0
      ? options.explicitAgentId.trim()
      : null;
  return {
    runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
    planningOnlySelectors: ['team'],
    activeRuntimeSelector: explicitProfileName ? 'profile' : explicitAgentId ? 'agent' : 'config',
    teamSelectionAffectsRuntime: false,
  };
}

export function getActiveRuntimeProfileName(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): string | null {
  const configRecord = config as MutableRecord;
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(config);
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  const runtimeProfiles = getBridgeRuntimeProfiles(config);
  const explicit =
    typeof options.explicitProfileName === 'string' && options.explicitProfileName.trim().length > 0
      ? options.explicitProfileName.trim()
      : typeof configRecord.defaultRuntimeProfile === 'string' &&
          configRecord.defaultRuntimeProfile.trim().length > 0
        ? configRecord.defaultRuntimeProfile.trim()
      : typeof config.auracallProfile === 'string' && config.auracallProfile.trim().length > 0
        ? config.auracallProfile.trim()
        : null;
  if (explicit && currentRuntimeProfiles[explicit]) return explicit;
  if (explicit && legacyRuntimeProfiles[explicit]) return explicit;
  if (runtimeProfiles.default) return 'default';
  const keys = Object.keys(runtimeProfiles);
  return keys.length > 0 ? keys[0] ?? null : null;
}

export function getPreferredRuntimeProfileName(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null; explicitAgentId?: string | null } = {},
): string | null {
  const explicit =
    typeof options.explicitProfileName === 'string' && options.explicitProfileName.trim().length > 0
      ? options.explicitProfileName.trim()
      : null;
  if (!explicit) {
    const explicitAgentId =
      typeof options.explicitAgentId === 'string' && options.explicitAgentId.trim().length > 0
        ? options.explicitAgentId.trim()
        : null;
    if (explicitAgentId) {
      const agentSelection = resolveAgentSelection(config, explicitAgentId);
      if (agentSelection.runtimeProfileId) {
        return getPreferredRuntimeProfileName(config, {
          explicitProfileName: agentSelection.runtimeProfileId,
        });
      }
    }
    return getActiveRuntimeProfileName(config);
  }
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(config);
  if (currentRuntimeProfiles[explicit]) {
    return explicit;
  }
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  if (legacyRuntimeProfiles[explicit]) {
    return explicit;
  }
  return getActiveRuntimeProfileName(config, {
    explicitProfileName: explicit,
  });
}

export function getActiveRuntimeProfile(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): MutableRuntimeProfile | null {
  const profileName = getActiveRuntimeProfileName(config, options);
  if (!profileName) return null;
  const runtimeProfiles = getBridgeRuntimeProfiles(config);
  return isRecord(runtimeProfiles[profileName]) ? runtimeProfiles[profileName] : null;
}

export function getPreferredRuntimeProfile(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null; explicitAgentId?: string | null } = {},
): MutableRuntimeProfile | null {
  const profileName = getPreferredRuntimeProfileName(config, options);
  if (!profileName) return null;
  const currentRuntimeProfiles = getCurrentRuntimeProfiles(config);
  if (isRecord(currentRuntimeProfiles[profileName])) {
    return currentRuntimeProfiles[profileName];
  }
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  return isRecord(legacyRuntimeProfiles[profileName]) ? legacyRuntimeProfiles[profileName] : null;
}

export function projectConfigModel(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ProjectedConfigModel {
  const activeRuntimeProfileId = getPreferredRuntimeProfileName(config, options);
  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeRuntimeProfileId,
  });
  const browserProfiles = Object.keys(getBrowserProfiles(config))
    .sort()
    .map((id) => ({ id }));
  const runtimeProfiles = Object.entries(getCurrentRuntimeProfiles(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, runtimeProfile]) => ({
      id,
      browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
      defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
    }));
  const agents = Object.entries(getAgents(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, agent]) => {
      const runtimeProfileId = getAgentRuntimeProfileId(agent);
      const runtimeProfile = getAgentRuntimeProfile(config, agent);
      return {
        id,
        runtimeProfileId,
        browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
        defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
      };
    });
  const projectedAgentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const teams = Object.entries(getTeams(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id]) => {
      const resolvedTeam = resolveTeamSelection(config, id);
      return {
        id,
        agentIds: resolvedTeam.agentIds,
        members: resolvedTeam.members.map((member) => {
          const projectedAgent = projectedAgentMap.get(member.agentId ?? '') ?? null;
          return {
            agentId: member.agentId ?? '',
            exists: projectedAgent !== null,
            runtimeProfileId: member.runtimeProfileId,
            browserProfileId: member.browserProfileId,
            defaultService: member.defaultService,
          };
        }),
      };
    });
  return {
    activeRuntimeProfileId,
    activeBrowserProfileId: getRuntimeProfileBrowserProfileId(activeRuntimeProfile),
    browserProfiles,
    runtimeProfiles,
    agents,
    teams,
  };
}

export function inspectConfigModel(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ConfigModelInspection {
  const activeRuntimeProfileId = getPreferredRuntimeProfileName(config, options);
  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeRuntimeProfileId,
  });
  const targetBrowserProfiles = getTargetBrowserProfiles(config);
  const targetRuntimeProfiles = getTargetRuntimeProfiles(config);
  const browserProfileIds = Object.keys(getBrowserProfiles(config)).sort();
  const runtimeProfiles = Object.entries(getCurrentRuntimeProfiles(config))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, runtimeProfile]) => ({
      id,
      browserProfileId: getRuntimeProfileBrowserProfileId(runtimeProfile),
      defaultService: asServiceId(isRecord(runtimeProfile) ? runtimeProfile.defaultService : undefined),
    }));
  const agentIds = Object.keys(getAgents(config)).sort();
  const teamIds = Object.keys(getTeams(config)).sort();
  const projectedModel = projectConfigModel(config, options);
  const legacyRuntimeProfileIds = Object.keys(getLegacyRuntimeProfiles(config)).sort();
  return {
    activeRuntimeProfileId,
    activeBrowserProfileId: getRuntimeProfileBrowserProfileId(activeRuntimeProfile),
    activeDefaultService: asServiceId(isRecord(activeRuntimeProfile) ? activeRuntimeProfile.defaultService : undefined),
    browserProfileIds,
    runtimeProfiles,
    agentIds,
    teamIds,
    legacyRuntimeProfileIds,
    targetState: {
      browserProfilesPresent: Object.keys(targetBrowserProfiles).length > 0,
      runtimeProfilesPresent: Object.keys(targetRuntimeProfiles).length > 0,
    },
    bridgeState: {
      browserProfilesPresent: browserProfileIds.length > 0,
      auracallRuntimeProfilesPresent: runtimeProfiles.length > 0,
      legacyRuntimeProfilesPresent: legacyRuntimeProfileIds.length > 0,
    },
    bridgeKeys: CONFIG_MODEL_BRIDGE_KEYS,
    projectedModel,
  };
}

export function analyzeConfigModelBridgeHealth(
  config: OracleConfig | MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): ConfigModelDoctorReport {
  const inspection = inspectConfigModel(config, options);
  const activeAuracallRuntimeProfile = getPreferredRuntimeProfileName(config, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  const targetBrowserProfiles = getTargetBrowserProfiles(config);
  const bridgeBrowserProfiles = isRecord(config.browserFamilies)
    ? (config.browserFamilies as Record<string, MutableBrowserProfile>)
    : {};
  const browserProfiles = getBrowserProfiles(config);
  const browserProfileNames = new Set(Object.keys(browserProfiles));
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  const runtimeProfileNames = new Set(Object.keys(runtimeProfiles));
  const agents = getAgents(config);
  const teams = getTeams(config);
  const targetRuntimeProfiles = getTargetRuntimeProfiles(config);
  const bridgeRuntimeProfiles = getRuntimeProfiles(config);
  const legacyRuntimeProfiles = getLegacyRuntimeProfiles(config);
  const issues: ConfigModelDoctorIssue[] = [];
  const referencedBrowserProfiles = new Set<string>();

  const globalBrowserServiceScopedDefaults = describeGlobalBrowserServiceScopedDefaults(config);
  if (globalBrowserServiceScopedDefaults.length > 0) {
    issues.push({
      code: 'global-browser-service-scoped-defaults-present',
      severity: 'info',
      message: `Top-level browser config still defines service/project-scoped defaults (${globalBrowserServiceScopedDefaults.join(', ')}); keep root browser config focused on global browser automation behavior and prefer services.<service> or runtimeProfiles.<name>.services.<service> for these defaults.`,
    });
  }
  const llmDefaultsServiceScopedDefaults = describeLlmDefaultsServiceScopedDefaults(config);
  if (llmDefaultsServiceScopedDefaults.length > 0) {
    issues.push({
      code: 'llm-defaults-service-scoped-defaults-present',
      severity: 'info',
      message: `llmDefaults still defines compatibility-only service defaults (${llmDefaultsServiceScopedDefaults.join(', ')}); keep llmDefaults as a compatibility bridge only and prefer services.<service> or runtimeProfiles.<name>.services.<service> for active service/project behavior.`,
    });
  }

  if (Object.keys(targetBrowserProfiles).length > 0 && Object.keys(bridgeBrowserProfiles).length > 0) {
    issues.push({
      code: 'mixed-browser-profile-keys',
      severity: 'info',
      message: 'Both `browserProfiles` and `browserFamilies` are present; target browser-profile keys are authoritative.',
    });
    for (const name of Object.keys(targetBrowserProfiles)) {
      if (bridgeBrowserProfiles[name] && !areEquivalentRecords(targetBrowserProfiles[name], bridgeBrowserProfiles[name])) {
        issues.push({
          code: 'conflicting-browser-profile-definitions',
          severity: 'warning',
          message: `Browser profile "${name}" differs between \`browserProfiles\` and \`browserFamilies\`.`,
          browserProfile: name,
        });
      }
    }
  }

  for (const [name, browserProfile] of Object.entries(browserProfiles)) {
    if (!isRecord(browserProfile)) continue;
    const serviceScopedOverrides = describeBrowserProfileServiceScopedOverrides(browserProfile);
    if (serviceScopedOverrides.length > 0) {
      issues.push({
        code: 'browser-profile-service-scoped-overrides-present',
        severity: 'info',
        message: `Browser profile "${name}" still defines service-scoped overrides (${serviceScopedOverrides.join(', ')}); keep browser profiles focused on browser/account-family state and move service defaults to runtimeProfiles.<name>.services.<service> instead.`,
        browserProfile: name,
      });
    }
  }

  if (Object.keys(targetRuntimeProfiles).length > 0 && Object.keys(bridgeRuntimeProfiles).length > 0) {
    issues.push({
      code: 'mixed-runtime-profile-keys',
      severity: 'info',
      message: 'Both `runtimeProfiles` and `profiles` are present; target runtime-profile keys are authoritative.',
    });
    for (const name of Object.keys(targetRuntimeProfiles)) {
      if (bridgeRuntimeProfiles[name] && !areEquivalentRecords(targetRuntimeProfiles[name], bridgeRuntimeProfiles[name])) {
        issues.push({
          code: 'conflicting-runtime-profile-definitions',
          severity: 'warning',
          message: `AuraCall runtime profile "${name}" differs between \`runtimeProfiles\` and \`profiles\`.`,
          auracallRuntimeProfile: name,
        });
      }
    }
  }

  if (Object.keys(runtimeProfiles).length === 0) {
    issues.push({
      code: 'no-runtime-profiles',
      severity: 'warning',
      message: 'No AuraCall runtime profiles are defined under the current bridge key `profiles`.',
    });
  }

  if (Object.keys(legacyRuntimeProfiles).length > 0) {
    issues.push({
      code: 'legacy-runtime-profiles-present',
      severity: 'info',
      message: 'Legacy runtime profiles are still present under `auracallProfiles`.',
    });
  }

  for (const [name, agent] of Object.entries(agents)) {
    const runtimeProfileId = getAgentRuntimeProfileId(agent);
    if (!runtimeProfileId) {
      issues.push({
        code: 'agent-missing-runtime-profile',
        severity: 'warning',
        message: `Agent "${name}" does not explicitly reference an AuraCall runtime profile.`,
        agent: name,
      });
      continue;
    }
    if (!runtimeProfileNames.has(runtimeProfileId)) {
      issues.push({
        code: 'agent-runtime-profile-missing',
        severity: 'warning',
        message: `Agent "${name}" references missing AuraCall runtime profile "${runtimeProfileId}".`,
        agent: name,
        auracallRuntimeProfile: runtimeProfileId,
      });
    }
  }

  for (const [name, team] of Object.entries(teams)) {
    const agentIds =
      isRecord(team) && Array.isArray(team.agents)
        ? team.agents.filter((agentId): agentId is string => typeof agentId === 'string')
        : [];
    for (const agentId of agentIds) {
      if (!agents[agentId]) {
        issues.push({
          code: 'team-agent-missing',
          severity: 'warning',
          message: `Team "${name}" references missing agent "${agentId}".`,
          team: name,
          agent: agentId,
        });
      }
    }
  }

  for (const [name, runtimeProfile] of Object.entries(runtimeProfiles)) {
    if (isRecord(runtimeProfile)) {
      const browserOwnedOverrides = describeRuntimeProfileBrowserOwnedOverrides(runtimeProfile);
      if (browserOwnedOverrides.length > 0) {
        issues.push({
          code: 'runtime-profile-browser-owned-overrides-present',
          severity: 'warning',
          message: `AuraCall runtime profile "${name}" still defines browser-owned override fields (${browserOwnedOverrides.join(', ')}); move them to the referenced browser profile unless this is an intentional advanced escape hatch.`,
          auracallRuntimeProfile: name,
        });
      }
      const relocatableServiceOverrides = describeRuntimeProfileRelocatableServiceOverrides(runtimeProfile);
      if (relocatableServiceOverrides.length > 0) {
        const defaultService = asServiceId(runtimeProfile.defaultService);
        issues.push({
          code: 'runtime-profile-service-scoped-overrides-relocatable-present',
          severity: 'info',
          message: defaultService
            ? `AuraCall runtime profile "${name}" still defines relocatable service-scoped browser overrides (${relocatableServiceOverrides.join(', ')}); prefer runtimeProfiles.<name>.services.${defaultService}, and keep runtimeProfiles.<name>.browser for non-service escape hatches only.`
            : `AuraCall runtime profile "${name}" still defines relocatable service-scoped browser overrides (${relocatableServiceOverrides.join(', ')}); declare one concrete defaultService or move them manually into runtimeProfiles.<name>.services.<service>.`,
          auracallRuntimeProfile: name,
        });
      }
      const serviceScopedEscapeHatches = describeRuntimeProfileServiceScopedEscapeHatches(runtimeProfile);
      if (serviceScopedEscapeHatches.length > 0) {
        issues.push({
          code: 'runtime-profile-service-scoped-escape-hatches-present',
          severity: 'info',
          message: `AuraCall runtime profile "${name}" still defines service-scoped browser escape hatches (${serviceScopedEscapeHatches.join(', ')}); keep them only when the managed-profile/account coupling is intentional, and do not auto-relocate them casually.`,
          auracallRuntimeProfile: name,
        });
      }
      const redundantManagedProfileDirOverrides = describeRedundantManagedProfileDirOverrides(config, name, runtimeProfile);
      if (redundantManagedProfileDirOverrides.length > 0) {
        issues.push({
          code: 'runtime-profile-manual-login-profile-dir-redundant',
          severity: 'info',
          message: `AuraCall runtime profile "${name}" still defines default-equivalent managed profile paths (${redundantManagedProfileDirOverrides.join(', ')}); remove them unless you intend a real external managed-profile override.`,
          auracallRuntimeProfile: name,
        });
      }
      const redundantServiceDefaults = describeRedundantRuntimeProfileServiceDefaults(config, runtimeProfile);
      if (redundantServiceDefaults.length > 0) {
        issues.push({
          code: 'runtime-profile-service-defaults-redundant',
          severity: 'info',
          message: `AuraCall runtime profile "${name}" still defines default-equivalent service overrides (${redundantServiceDefaults.join(', ')}); remove them unless this runtime profile intentionally diverges from inherited service defaults.`,
          auracallRuntimeProfile: name,
        });
      }
    }
    if (
      isRecord(runtimeProfile) &&
      typeof runtimeProfile.browserProfile === 'string' &&
      runtimeProfile.browserProfile.trim().length > 0 &&
      typeof runtimeProfile.browserFamily === 'string' &&
      runtimeProfile.browserFamily.trim().length > 0 &&
      runtimeProfile.browserProfile.trim() !== runtimeProfile.browserFamily.trim()
    ) {
      issues.push({
        code: 'mixed-runtime-profile-browser-reference',
        severity: 'warning',
        message: `AuraCall runtime profile "${name}" defines conflicting browser-profile references in \`browserProfile\` and \`browserFamily\`.`,
        auracallRuntimeProfile: name,
        browserProfile: runtimeProfile.browserProfile.trim(),
      });
    }
    const browserProfile = getRuntimeProfileBrowserProfileId(runtimeProfile);
    if (!browserProfile) {
      issues.push({
        code: 'runtime-profile-missing-browser-profile',
        severity: 'warning',
        message: `AuraCall runtime profile "${name}" does not explicitly reference a browser profile.`,
        auracallRuntimeProfile: name,
      });
      continue;
    }
    referencedBrowserProfiles.add(browserProfile);
    if (!browserProfileNames.has(browserProfile)) {
      issues.push({
        code: 'runtime-profile-browser-profile-missing',
        severity: 'warning',
        message: `AuraCall runtime profile "${name}" references missing browser profile "${browserProfile}".`,
        auracallRuntimeProfile: name,
        browserProfile,
      });
    }
  }

  for (const browserProfile of browserProfileNames) {
    if (!referencedBrowserProfiles.has(browserProfile)) {
      issues.push({
        code: 'unused-browser-profile',
        severity: 'info',
        message: `Browser profile "${browserProfile}" is defined but no AuraCall runtime profile references it.`,
        browserProfile,
      });
    }
  }

  const activeRuntimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: activeAuracallRuntimeProfile,
  });
  const activeBrowserProfile = getRuntimeProfileBrowserProfileId(activeRuntimeProfile);
  if (activeAuracallRuntimeProfile && !activeBrowserProfile) {
    issues.push({
      code: 'active-runtime-profile-missing-browser-profile',
      severity: 'warning',
      message: `Active AuraCall runtime profile "${activeAuracallRuntimeProfile}" does not explicitly reference a browser profile.`,
      auracallRuntimeProfile: activeAuracallRuntimeProfile,
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'warning'),
    activeAuracallRuntimeProfile,
    activeBrowserProfile,
    targetState: inspection.targetState,
    precedence: {
      browserProfiles: inspection.targetState.browserProfilesPresent ? 'target' : 'bridge',
      runtimeProfiles: inspection.targetState.runtimeProfilesPresent ? 'target' : 'bridge',
      runtimeProfileBrowserProfileReference:
        inspection.targetState.runtimeProfilesPresent ? 'target' : 'bridge',
    },
    issueCount: issues.length,
    issues,
  };
}

export function setBrowserProfile(
  config: MutableRecord,
  browserProfileName: string,
  browserProfile: MutableBrowserProfile,
): void {
  const browserProfiles = ensureBrowserProfiles(config);
  browserProfiles[browserProfileName] = browserProfile;
}

export function setRuntimeProfile(
  config: MutableRecord,
  runtimeProfileName: string,
  runtimeProfile: MutableRuntimeProfile,
): void {
  const runtimeProfiles = ensureRuntimeProfiles(config);
  runtimeProfiles[runtimeProfileName] = runtimeProfile;
}

export function setRuntimeProfileBrowserProfile(
  runtimeProfile: MutableRuntimeProfile,
  browserProfileName: string,
): void {
  runtimeProfile.browserFamily = browserProfileName;
}
