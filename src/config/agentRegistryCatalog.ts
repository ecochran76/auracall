import {
  projectConfigModel,
  type ProjectedAgent,
  type ProjectedConfigModel,
  type ProjectedTeam,
} from './model.js';
import type {
  AgentRegistryAgentRecord,
  AgentRegistryTeamRecord,
} from './agentRegistryStore.js';

type MutableConfig = Record<string, unknown>;
type RegistryEntitySource = 'config' | 'registry' | 'config_seed' | 'import';

export interface EffectiveAgent extends ProjectedAgent {
  source: RegistryEntitySource;
  enabled: boolean;
  revision?: number;
}

export interface EffectiveTeam extends ProjectedTeam {
  source: RegistryEntitySource;
  enabled: boolean;
  revision?: number;
}

export interface EffectiveCatalogConflict {
  kind: 'agent' | 'team';
  id: string;
  configSource: 'config';
  registrySource: AgentRegistryAgentRecord['source'] | AgentRegistryTeamRecord['source'];
  resolution: 'config-wins';
}

export interface EffectiveAgentCatalog extends Omit<ProjectedConfigModel, 'agents' | 'teams'> {
  agents: EffectiveAgent[];
  teams: EffectiveTeam[];
  conflicts: EffectiveCatalogConflict[];
}

export function createEffectiveAgentConfigRecord(input: {
  config: MutableConfig;
  registryAgents?: AgentRegistryAgentRecord[];
  registryTeams?: AgentRegistryTeamRecord[];
}): MutableConfig {
  const configAgents = getRecord(input.config.agents);
  const configTeams = getRecord(input.config.teams);
  const mergedAgents: Record<string, unknown> = {};
  const mergedTeams: Record<string, unknown> = {};

  for (const record of [...(input.registryAgents ?? [])]
    .filter((record) => record.enabled)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    mergedAgents[record.id] = record.config;
  }
  for (const [id, value] of Object.entries(configAgents).sort(([left], [right]) => left.localeCompare(right))) {
    mergedAgents[id] = value;
  }

  for (const record of [...(input.registryTeams ?? [])]
    .filter((record) => record.enabled)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    mergedTeams[record.id] = record.config;
  }
  for (const [id, value] of Object.entries(configTeams).sort(([left], [right]) => left.localeCompare(right))) {
    mergedTeams[id] = value;
  }

  return {
    ...input.config,
    agents: mergedAgents,
    teams: mergedTeams,
  };
}

export function createEffectiveAgentCatalog(input: {
  config: MutableConfig;
  registryAgents?: AgentRegistryAgentRecord[];
  registryTeams?: AgentRegistryTeamRecord[];
}): EffectiveAgentCatalog {
  const registryAgentMap = new Map((input.registryAgents ?? [])
    .filter((record) => record.enabled)
    .map((record) => [record.id, record]));
  const registryTeamMap = new Map((input.registryTeams ?? [])
    .filter((record) => record.enabled)
    .map((record) => [record.id, record]));
  const conflicts: EffectiveCatalogConflict[] = [];
  const sourceByAgentId = new Map<string, { source: RegistryEntitySource; revision?: number }>();
  const sourceByTeamId = new Map<string, { source: RegistryEntitySource; revision?: number }>();
  const effectiveConfig = createEffectiveAgentConfigRecord(input);

  for (const [id, record] of [...registryAgentMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    sourceByAgentId.set(id, { source: record.source, revision: record.revision });
  }
  for (const [id] of Object.entries(getRecord(input.config.agents)).sort(([left], [right]) => left.localeCompare(right))) {
    if (registryAgentMap.has(id)) {
      conflicts.push({
        kind: 'agent',
        id,
        configSource: 'config',
        registrySource: registryAgentMap.get(id)?.source ?? 'registry',
        resolution: 'config-wins',
      });
    }
    sourceByAgentId.set(id, { source: 'config' });
  }

  for (const [id, record] of [...registryTeamMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    sourceByTeamId.set(id, { source: record.source, revision: record.revision });
  }
  for (const [id] of Object.entries(getRecord(input.config.teams)).sort(([left], [right]) => left.localeCompare(right))) {
    if (registryTeamMap.has(id)) {
      conflicts.push({
        kind: 'team',
        id,
        configSource: 'config',
        registrySource: registryTeamMap.get(id)?.source ?? 'registry',
        resolution: 'config-wins',
      });
    }
    sourceByTeamId.set(id, { source: 'config' });
  }

  const projected = projectConfigModel(effectiveConfig);

  return {
    ...projected,
    agents: projected.agents.map((agent) => ({
      ...agent,
      source: sourceByAgentId.get(agent.id)?.source ?? 'config',
      enabled: true,
      ...(sourceByAgentId.get(agent.id)?.revision
        ? { revision: sourceByAgentId.get(agent.id)?.revision }
        : {}),
    })),
    teams: projected.teams.map((team) => ({
      ...team,
      source: sourceByTeamId.get(team.id)?.source ?? 'config',
      enabled: true,
      ...(sourceByTeamId.get(team.id)?.revision
        ? { revision: sourceByTeamId.get(team.id)?.revision }
        : {}),
    })),
    conflicts,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
