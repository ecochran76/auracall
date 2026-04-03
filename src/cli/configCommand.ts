import type { ResolvedUserConfig } from '../config.js';
import {
  analyzeConfigModelBridgeHealth,
  inspectConfigModel,
  getPreferredRuntimeProfileName,
  resolveAgentSelection,
  resolveTeamSelection,
  resolveTeamRuntimeSelections,
  resolveRuntimeSelection,
  type ConfigModelBridgeKeys,
  type ConfigModelInspection,
  type ConfigModelDoctorIssue,
  type ConfigModelDoctorReport,
  type ProjectedConfigModel,
} from '../config/model.js';

type MutableRecord = Record<string, unknown>;
type SelectorKeysReport = {
  target: 'defaultRuntimeProfile';
  compatibility: 'auracallProfile';
  targetPresent: boolean;
  compatibilityPresent: boolean;
};

export interface ConfigShowReport {
  configPath: string;
  loaded: boolean;
  selectorKeys: SelectorKeysReport;
  active: {
    agent: {
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    } | null;
    auracallRuntimeProfile: string | null;
    browserProfile: string | null;
    defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
    resolvedBrowserTarget: 'chatgpt' | 'gemini' | 'grok' | null;
  };
  available: {
    browserProfiles: string[];
    auracallRuntimeProfiles: string[];
    agents: string[];
    teams: string[];
    legacyRuntimeProfiles: string[];
  };
  resolvedAgents: Array<{
    agentId: string | null;
    runtimeProfileId: string | null;
    browserProfileId: string | null;
    defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
    exists: boolean;
  }>;
  resolvedTeams: Array<{
    teamId: string | null;
    agentIds: string[];
    members: Array<{
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    }>;
    exists: boolean;
  }>;
  selectedTeam: {
    teamId: string | null;
    agentIds: string[];
    members: Array<{
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    }>;
    runtimeMembers: Array<{
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    }>;
    exists: boolean;
  } | null;
  bridgeKeys: ConfigModelBridgeKeys;
  targetKeys: {
    browserProfiles: 'browserProfiles';
    auracallRuntimeProfiles: 'runtimeProfiles';
    runtimeProfileBrowserProfile: 'runtimeProfiles.<name>.browserProfile';
  };
  targetState: {
    browserProfilesPresent: boolean;
    runtimeProfilesPresent: boolean;
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

export interface AgentListEntry {
  name: string;
  runtimeProfile: string | null;
  browserProfile: string | null;
  defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
}

export interface TeamListEntry {
  name: string;
  agents: string[];
  members: Array<{
    agent: string;
    exists: boolean;
    runtimeProfile: string | null;
    browserProfile: string | null;
    defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
  }>;
}

export interface ProfileListReport {
  activeAuracallRuntimeProfile: string | null;
  browserProfiles: string[];
  auracallRuntimeProfiles: ProfileListEntry[];
  agents: AgentListEntry[];
  teams: TeamListEntry[];
  bridgeKeys: ConfigModelBridgeKeys;
  projectedModel: ProjectedConfigModel;
}

export type ConfigDoctorIssue = ConfigModelDoctorIssue;
export type ConfigDoctorReport = ConfigModelDoctorReport & {
  selectorKeys: SelectorKeysReport;
  selectedAgent: {
    agentId: string | null;
    runtimeProfileId: string | null;
    browserProfileId: string | null;
    defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
    exists: boolean;
  } | null;
  selectedTeam: {
    teamId: string | null;
    agentIds: string[];
    members: Array<{
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    }>;
    runtimeMembers: Array<{
      agentId: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      defaultService: 'chatgpt' | 'gemini' | 'grok' | null;
      exists: boolean;
    }>;
    exists: boolean;
  } | null;
};

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

function buildSelectorKeysReport(rawConfig: MutableRecord): SelectorKeysReport {
  return {
    target: 'defaultRuntimeProfile',
    compatibility: 'auracallProfile',
    targetPresent: typeof rawConfig.defaultRuntimeProfile === 'string' && rawConfig.defaultRuntimeProfile.trim().length > 0,
    compatibilityPresent: typeof rawConfig.auracallProfile === 'string' && rawConfig.auracallProfile.trim().length > 0,
  };
}

export function buildConfigShowReport(input: {
  rawConfig: MutableRecord;
  resolvedConfig: ResolvedUserConfig;
  configPath: string;
  loaded: boolean;
  explicitAgentId?: string | null;
  explicitTeamId?: string | null;
}): ConfigShowReport {
  const inspection = inspectConfigModel(input.rawConfig, {
    explicitProfileName: input.resolvedConfig.auracallProfile ?? null,
  });
  const selection = resolveRuntimeSelection(input.rawConfig, {
    explicitProfileName: input.resolvedConfig.auracallProfile ?? null,
    explicitAgentId: input.explicitAgentId ?? null,
  });
  const selectedTeam =
    typeof input.explicitTeamId === 'string' && input.explicitTeamId.trim().length > 0
      ? (() => {
          const team = resolveTeamSelection(input.rawConfig, input.explicitTeamId);
          const teamRuntime = resolveTeamRuntimeSelections(input.rawConfig, input.explicitTeamId);
          return {
            teamId: team.teamId,
            agentIds: team.agentIds,
            members: team.members,
            runtimeMembers: teamRuntime.members.map((member) => ({
              agentId: member.agentId,
              runtimeProfileId: member.runtimeProfileId,
              browserProfileId: member.browserProfileId,
              defaultService: member.defaultService,
              exists: member.exists,
            })),
            exists: team.exists,
          };
        })()
      : null;

  return {
    configPath: input.configPath,
    loaded: input.loaded,
    selectorKeys: buildSelectorKeysReport(input.rawConfig),
    active: {
      agent: selection.agent,
      auracallRuntimeProfile: selection.runtimeProfileId ?? input.resolvedConfig.auracallProfile ?? null,
      browserProfile: selection.browserProfileId,
      defaultService: selection.defaultService,
      resolvedBrowserTarget: asServiceId(input.resolvedConfig.browser?.target),
    },
    available: {
      browserProfiles: inspection.browserProfileIds,
      auracallRuntimeProfiles: inspection.runtimeProfiles.map((profile) => profile.id),
      agents: inspection.agentIds,
      teams: inspection.teamIds,
      legacyRuntimeProfiles: inspection.legacyRuntimeProfileIds,
    },
    resolvedAgents: inspection.agentIds.map((agentId) => resolveAgentSelection(input.rawConfig, agentId)),
    resolvedTeams: inspection.teamIds.map((teamId) => resolveTeamSelection(input.rawConfig, teamId)),
    selectedTeam,
    bridgeKeys: inspection.bridgeKeys,
    targetKeys: {
      browserProfiles: 'browserProfiles',
      auracallRuntimeProfiles: 'runtimeProfiles',
      runtimeProfileBrowserProfile: 'runtimeProfiles.<name>.browserProfile',
    },
    targetState: inspection.targetState,
    bridgeState: inspection.bridgeState,
    projectedModel: inspection.projectedModel,
  };
}

export function buildRuntimeProfileBridgeSummary(
  rawConfig: MutableRecord,
  options: { explicitProfileName?: string | null } = {},
): RuntimeProfileBridgeSummary {
  const selection = resolveRuntimeSelection(rawConfig, {
    explicitProfileName: options.explicitProfileName ?? null,
  });
  return {
    auracallRuntimeProfile: selection.runtimeProfileId,
    browserProfile: selection.browserProfileId,
    defaultService: selection.defaultService,
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
  const agents = inspection.projectedModel.agents.map((agent) => ({
    name: agent.id,
    runtimeProfile: agent.runtimeProfileId,
    browserProfile: agent.browserProfileId,
    defaultService: agent.defaultService,
  }));
  const teams = inspection.projectedModel.teams.map((team) => {
    const resolvedTeam = resolveTeamSelection(rawConfig, team.id);
    return {
      name: team.id,
      agents: resolvedTeam.agentIds,
      members: resolvedTeam.members.map((member) => ({
        agent: member.agentId ?? '(none)',
        exists: member.exists,
        runtimeProfile: member.runtimeProfileId,
        browserProfile: member.browserProfileId,
        defaultService: member.defaultService,
      })),
    };
  });
  return {
    activeAuracallRuntimeProfile: inspection.activeRuntimeProfileId,
    browserProfiles: inspection.browserProfileIds,
    auracallRuntimeProfiles,
    agents,
    teams,
    bridgeKeys: inspection.bridgeKeys,
    projectedModel: inspection.projectedModel,
  };
}

export function buildConfigDoctorReport(
  rawConfig: MutableRecord,
  options: { explicitProfileName?: string | null; explicitAgentId?: string | null; explicitTeamId?: string | null } = {},
): ConfigDoctorReport {
  const selection = resolveRuntimeSelection(rawConfig, options);
  const selectedTeam =
    typeof options.explicitTeamId === 'string' && options.explicitTeamId.trim().length > 0
      ? (() => {
          const team = resolveTeamSelection(rawConfig, options.explicitTeamId);
          const teamRuntime = resolveTeamRuntimeSelections(rawConfig, options.explicitTeamId);
          return {
            teamId: team.teamId,
            agentIds: team.agentIds,
            members: team.members,
            runtimeMembers: teamRuntime.members.map((member) => ({
              agentId: member.agentId,
              runtimeProfileId: member.runtimeProfileId,
              browserProfileId: member.browserProfileId,
              defaultService: member.defaultService,
              exists: member.exists,
            })),
            exists: team.exists,
          };
        })()
      : null;
  return {
    ...analyzeConfigModelBridgeHealth(rawConfig, options),
    selectorKeys: buildSelectorKeysReport(rawConfig),
    selectedAgent: selection.agent,
    selectedTeam,
  };
}

export function formatConfigShowReport(report: ConfigShowReport): string {
  const lines = [
    `Config path: ${report.configPath}`,
    `Loaded: ${report.loaded ? 'yes' : 'no'}`,
    `Runtime profile selector -> ${report.selectorKeys.target} (${report.selectorKeys.targetPresent ? 'present' : 'missing'})`,
    `Compatibility selector -> ${report.selectorKeys.compatibility} (${report.selectorKeys.compatibilityPresent ? 'present' : 'missing'})`,
    `Selected agent: ${
      report.active.agent
        ? `${report.active.agent.agentId ?? '(none)'} -> ${report.active.agent.exists ? 'resolved' : 'missing'}`
        : '(none)'
    }`,
    `Selected team: ${
      report.selectedTeam
        ? `${report.selectedTeam.teamId ?? '(none)'} -> ${report.selectedTeam.exists ? 'resolved' : 'missing'}`
        : '(none)'
    }`,
    `AuraCall runtime profile: ${report.active.auracallRuntimeProfile ?? '(none)'}`,
    `Browser profile: ${report.active.browserProfile ?? '(none)'}`,
    `Default service: ${report.active.defaultService ?? '(none)'}`,
    `Resolved browser target: ${report.active.resolvedBrowserTarget ?? '(none)'}`,
    `Available browser profiles: ${formatList(report.available.browserProfiles)}`,
    `Available AuraCall runtime profiles: ${formatList(report.available.auracallRuntimeProfiles)}`,
    `Available agents: ${formatList(report.available.agents)}`,
    `Available teams: ${formatList(report.available.teams)}`,
    `Legacy runtime profiles: ${formatList(report.available.legacyRuntimeProfiles)}`,
    'Target keys:',
    `  browser profiles -> ${report.targetKeys.browserProfiles} (${report.targetState.browserProfilesPresent ? 'present' : 'missing'})`,
    `  AuraCall runtime profiles -> ${report.targetKeys.auracallRuntimeProfiles} (${report.targetState.runtimeProfilesPresent ? 'present' : 'missing'})`,
    `  runtime -> browser profile -> ${report.targetKeys.runtimeProfileBrowserProfile}`,
    'Bridge keys:',
    `  browser profiles -> ${report.bridgeKeys.browserProfiles} (${report.bridgeState.browserProfilesPresent ? 'present' : 'missing'})`,
    `  AuraCall runtime profiles -> ${report.bridgeKeys.auracallRuntimeProfiles} (${report.bridgeState.auracallRuntimeProfilesPresent ? 'present' : 'missing'})`,
    `  runtime -> browser profile -> ${report.bridgeKeys.runtimeProfileBrowserProfile}`,
    `  legacy runtime profiles present: ${report.bridgeState.legacyRuntimeProfilesPresent ? 'yes' : 'no'}`,
  ];
  if (report.resolvedAgents.length === 0) {
    lines.push('Resolved agents: (none)');
  } else {
    lines.push('Resolved agents:');
    for (const agent of report.resolvedAgents) {
      lines.push(
        `  - ${agent.agentId ?? '(none)'} -> ${agent.exists ? 'resolved' : 'missing'} -> runtime profile ${agent.runtimeProfileId ?? '(none)'} -> browser profile ${agent.browserProfileId ?? '(none)'} -> default service ${agent.defaultService ?? '(none)'}`,
      );
    }
  }
  if (report.resolvedTeams.length === 0) {
    lines.push('Resolved teams: (none)');
  } else {
    lines.push('Resolved teams:');
    for (const team of report.resolvedTeams) {
      lines.push(
        `  - ${team.teamId ?? '(none)'} -> ${team.exists ? 'resolved' : 'missing'} -> agents ${formatList(team.agentIds)}`,
      );
      for (const member of team.members) {
        lines.push(
          `    member ${member.agentId ?? '(none)'} -> ${member.exists ? 'resolved' : 'missing'} -> runtime profile ${member.runtimeProfileId ?? '(none)'} -> browser profile ${member.browserProfileId ?? '(none)'} -> default service ${member.defaultService ?? '(none)'}`,
        );
      }
    }
  }
  if (!report.selectedTeam) {
    lines.push('Selected team runtime plan: (none)');
  } else {
    lines.push('Selected team runtime plan:');
    lines.push(
      `  - ${report.selectedTeam.teamId ?? '(none)'} -> ${report.selectedTeam.exists ? 'resolved' : 'missing'} -> agents ${formatList(report.selectedTeam.agentIds)}`,
    );
    for (const member of report.selectedTeam.runtimeMembers) {
      lines.push(
        `    member ${member.agentId ?? '(none)'} -> ${member.exists ? 'resolved' : 'missing'} -> runtime profile ${member.runtimeProfileId ?? '(none)'} -> browser profile ${member.browserProfileId ?? '(none)'} -> default service ${member.defaultService ?? '(none)'}`,
      );
    }
  }
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
  lines.push(`Agents: ${report.agents.length > 0 ? '' : '(none)'}`.trimEnd());
  for (const agent of report.agents) {
    lines.push(
      `  - ${agent.name} -> runtime profile ${agent.runtimeProfile ?? '(none)'} -> browser profile ${agent.browserProfile ?? '(none)'} -> default service ${agent.defaultService ?? '(none)'}`,
    );
  }
  lines.push(`Teams: ${report.teams.length > 0 ? '' : '(none)'}`.trimEnd());
  for (const team of report.teams) {
    lines.push(`  - ${team.name} -> agents ${formatList(team.agents)}`);
    for (const member of team.members) {
      lines.push(
        `    member ${member.agent} -> ${member.exists ? 'resolved' : 'missing'} -> runtime profile ${member.runtimeProfile ?? '(none)'} -> browser profile ${member.browserProfile ?? '(none)'} -> default service ${member.defaultService ?? '(none)'}`,
      );
    }
  }
  return lines.join('\n');
}

export function formatConfigDoctorReport(report: ConfigDoctorReport): string {
  const lines = [
    `Runtime profile selector -> ${report.selectorKeys.target} (${report.selectorKeys.targetPresent ? 'present' : 'missing'})`,
    `Compatibility selector -> ${report.selectorKeys.compatibility} (${report.selectorKeys.compatibilityPresent ? 'present' : 'missing'})`,
    `Selected agent: ${
      report.selectedAgent
        ? `${report.selectedAgent.agentId ?? '(none)'} -> ${report.selectedAgent.exists ? 'resolved' : 'missing'}`
        : '(none)'
    }`,
    `Selected team: ${
      report.selectedTeam
        ? `${report.selectedTeam.teamId ?? '(none)'} -> ${report.selectedTeam.exists ? 'resolved' : 'missing'}`
        : '(none)'
    }`,
    `Active AuraCall runtime profile: ${report.activeAuracallRuntimeProfile ?? '(none)'}`,
    `Active browser profile: ${report.activeBrowserProfile ?? '(none)'}`,
    `Status: ${report.ok ? 'ok' : 'warnings'}`,
    `Target browserProfiles present: ${report.targetState.browserProfilesPresent ? 'yes' : 'no'}`,
    `Target runtimeProfiles present: ${report.targetState.runtimeProfilesPresent ? 'yes' : 'no'}`,
    `Precedence: browser profiles=${report.precedence.browserProfiles}, runtime profiles=${report.precedence.runtimeProfiles}, runtime->browser reference=${report.precedence.runtimeProfileBrowserProfileReference}`,
  ];
  if (report.issues.length === 0) {
    if (report.selectedTeam) {
      lines.push('Selected team runtime plan:');
      lines.push(
        `  - ${report.selectedTeam.teamId ?? '(none)'} -> ${report.selectedTeam.exists ? 'resolved' : 'missing'} -> agents ${formatList(report.selectedTeam.agentIds)}`,
      );
      for (const member of report.selectedTeam.runtimeMembers) {
        lines.push(
          `    member ${member.agentId ?? '(none)'} -> ${member.exists ? 'resolved' : 'missing'} -> runtime profile ${member.runtimeProfileId ?? '(none)'} -> browser profile ${member.browserProfileId ?? '(none)'} -> default service ${member.defaultService ?? '(none)'}`,
        );
      }
    }
    lines.push('Issues: (none)');
    return lines.join('\n');
  }
  if (report.selectedTeam) {
    lines.push('Selected team runtime plan:');
    lines.push(
      `  - ${report.selectedTeam.teamId ?? '(none)'} -> ${report.selectedTeam.exists ? 'resolved' : 'missing'} -> agents ${formatList(report.selectedTeam.agentIds)}`,
    );
    for (const member of report.selectedTeam.runtimeMembers) {
      lines.push(
        `    member ${member.agentId ?? '(none)'} -> ${member.exists ? 'resolved' : 'missing'} -> runtime profile ${member.runtimeProfileId ?? '(none)'} -> browser profile ${member.browserProfileId ?? '(none)'} -> default service ${member.defaultService ?? '(none)'}`,
      );
    }
  }
  lines.push('Issues:');
  for (const issue of report.issues) {
    lines.push(`  - [${issue.severity}] ${issue.message}`);
  }
  return lines.join('\n');
}
