import fs from 'node:fs/promises';
import path from 'node:path';
import JSON5 from 'json5';
import { z } from 'zod';
import { configPath, scaffoldDefaultConfigFile } from '../config.js';
import { AgentConfigSchema, TeamConfigSchema } from '../schema/types.js';
import type { ProjectedAgent, ProjectedTeam } from './model.js';
import { analyzeConfigModelBridgeHealth, type ConfigModelDoctorIssue } from './model.js';
import {
  createEffectiveAgentConfigRecord,
  createEffectiveAgentCatalog,
  type EffectiveAgent,
  type EffectiveAgentCatalog,
  type EffectiveCatalogConflict,
  type EffectiveTeam,
} from './agentRegistryCatalog.js';
import {
  createAgentRegistryStore,
  type AgentRegistryStore,
} from './agentRegistryStore.js';

type MutableConfig = Record<string, unknown>;

const CONFIG_ID_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Use only letters, numbers, dot, underscore, colon, or hyphen.');

export const agentConfigUpsertInputSchema = z.object({
  id: CONFIG_ID_SCHEMA,
  config: AgentConfigSchema,
});

export const teamConfigUpsertInputSchema = z.object({
  id: CONFIG_ID_SCHEMA,
  config: TeamConfigSchema,
});

export interface ConfigEntityMutationResult {
  object: 'auracall_config_entity';
  kind: 'agent' | 'team';
  action: 'list' | 'upsert' | 'delete';
  id: string | null;
  configPath: string;
  registryPath: string | null;
  mutationTarget: 'config' | 'registry' | 'blocked' | null;
  blockedReason: string | null;
  agents: Array<ProjectedAgent | EffectiveAgent>;
  teams: Array<ProjectedTeam | EffectiveTeam>;
  conflicts: EffectiveCatalogConflict[];
}

export interface AgentConfigApiKeyDiagnosticInput {
  id: string;
  hasSecret?: boolean;
  agents?: string[];
  teams?: string[];
  services?: string[];
  runtimeProfiles?: string[];
}

export interface AgentConfigDiagnosticIssue {
  severity: 'info' | 'warning';
  code: string;
  message: string;
  kind?: 'agent' | 'team' | 'api_key' | 'config';
  id?: string;
  keyId?: string;
}

export interface AgentConfigApiKeyDiagnostic {
  id: string;
  scoped: boolean;
  hasSecret: boolean;
  agents: string[];
  teams: string[];
  services: string[];
  runtimeProfiles: string[];
  effectiveAgents: string[];
  missingAgents: string[];
  missingTeams: string[];
  missingRuntimeProfiles: string[];
}

export interface AgentConfigDiagnosticsResult {
  object: 'auracall_agent_registry_diagnostics';
  ok: boolean;
  configPath: string;
  registryPath: string | null;
  metrics: {
    effectiveAgents: number;
    effectiveTeams: number;
    disabledRegistryAgents: number;
    disabledRegistryTeams: number;
    conflicts: number;
    apiKeys: number;
    issues: number;
    warnings: number;
  };
  apiKeys: AgentConfigApiKeyDiagnostic[];
  disabledRegistryAgents: string[];
  disabledRegistryTeams: string[];
  conflicts: EffectiveCatalogConflict[];
  configIssues: ConfigModelDoctorIssue[];
  issues: AgentConfigDiagnosticIssue[];
}

export interface AgentTeamConfigServiceDeps {
  configPath?: string;
  activeConfig?: MutableConfig | null;
  registryStore?: AgentRegistryStore | null;
}

export interface AgentTeamConfigService {
  list(kind?: 'agent' | 'team'): Promise<ConfigEntityMutationResult>;
  effectiveConfig(): Promise<MutableConfig>;
  effectiveCatalog(): Promise<EffectiveAgentCatalog>;
  diagnostics(input?: { apiKeys?: AgentConfigApiKeyDiagnosticInput[] }): Promise<AgentConfigDiagnosticsResult>;
  upsertAgent(input: z.infer<typeof agentConfigUpsertInputSchema>): Promise<ConfigEntityMutationResult>;
  deleteAgent(id: string): Promise<ConfigEntityMutationResult>;
  upsertTeam(input: z.infer<typeof teamConfigUpsertInputSchema>): Promise<ConfigEntityMutationResult>;
  deleteTeam(id: string): Promise<ConfigEntityMutationResult>;
}

export function createAgentTeamConfigService(
  deps: AgentTeamConfigServiceDeps = {},
): AgentTeamConfigService {
  const targetPath = deps.configPath ?? configPath();
  const activeConfig = deps.activeConfig ?? null;
  const registryStore = deps.registryStore === null
    ? null
    : deps.registryStore ?? (deps.configPath ? null : createAgentRegistryStore());

  const load = () => readWritableUserConfig(targetPath);
  const readProjectionConfig = async () => {
    if (!deps.configPath && activeConfig) {
      return activeConfig;
    }
    return load();
  };
  const save = async (next: MutableConfig) => {
    await writeJsonFile(targetPath, next);
    if (activeConfig) {
      replaceObjectContents(activeConfig, next);
    }
  };
  const result = async (
    action: ConfigEntityMutationResult['action'],
    kind: ConfigEntityMutationResult['kind'],
    id: string | null,
    config: MutableConfig,
    mutationTarget: ConfigEntityMutationResult['mutationTarget'] = null,
    blockedReason: string | null = null,
  ) => createResult({
    action,
    kind,
    id,
    path: targetPath,
    registryPath: registryStore?.dbPath ?? null,
    mutationTarget,
    blockedReason,
    catalog: await createEffectiveCatalog(config, registryStore),
  });

  return {
    async list(kind = 'agent') {
      const config = await readProjectionConfig();
      return result('list', kind, null, config);
    },

    async effectiveConfig() {
      const config = await readProjectionConfig();
      return createEffectiveAgentConfig(config, registryStore);
    },

    async effectiveCatalog() {
      const config = await readProjectionConfig();
      return createEffectiveAgentCatalog({
        config,
        registryAgents: registryStore ? await registryStore.listAgents({ includeDisabled: true }) : [],
        registryTeams: registryStore ? await registryStore.listTeams({ includeDisabled: true }) : [],
      });
    },

    async diagnostics(input = {}) {
      const config = await readProjectionConfig();
      const registryAgents = registryStore ? await registryStore.listAgents({ includeDisabled: true }) : [];
      const registryTeams = registryStore ? await registryStore.listTeams({ includeDisabled: true }) : [];
      const catalog = createEffectiveAgentCatalog({
        config,
        registryAgents,
        registryTeams,
      });
      const effectiveConfig = createEffectiveAgentConfigRecord({
        config,
        registryAgents,
        registryTeams,
      });
      return createDiagnosticsResult({
        effectiveConfig,
        catalog,
        configPath: targetPath,
        registryPath: registryStore?.dbPath ?? null,
        disabledRegistryAgents: registryAgents.filter((record) => !record.enabled).map((record) => record.id).sort(),
        disabledRegistryTeams: registryTeams.filter((record) => !record.enabled).map((record) => record.id).sort(),
        apiKeys: input.apiKeys ?? [],
      });
    },

    async upsertAgent(input) {
      const payload = agentConfigUpsertInputSchema.parse(input);
      const config = await load();
      if (registryStore) {
        if (hasConfigEntity(config, 'agents', payload.id)) {
          return result(
            'upsert',
            'agent',
            payload.id,
            config,
            'blocked',
            `Agent ${payload.id} is defined in config and shadows registry records.`,
          );
        }
        await registryStore.upsertAgent({
          id: payload.id,
          config: payload.config,
          updatedBy: 'auracall-config-service',
          createdBy: 'auracall-config-service',
        });
        return result('upsert', 'agent', payload.id, config, 'registry');
      }
      const agents = ensureRecord(config, 'agents');
      agents[payload.id] = payload.config;
      await save(config);
      return result('upsert', 'agent', payload.id, config, 'config');
    },

    async deleteAgent(id) {
      const parsedId = CONFIG_ID_SCHEMA.parse(id);
      const config = await load();
      if (registryStore) {
        if (hasConfigEntity(config, 'agents', parsedId)) {
          return result(
            'delete',
            'agent',
            parsedId,
            config,
            'blocked',
            `Agent ${parsedId} is defined in config and cannot be deleted through the registry write path.`,
          );
        }
        await registryStore.setAgentEnabled(parsedId, false, {
          updatedBy: 'auracall-config-service',
        });
        return result('delete', 'agent', parsedId, config, 'registry');
      }
      const agents = ensureRecord(config, 'agents');
      delete agents[parsedId];
      await save(config);
      return result('delete', 'agent', parsedId, config, 'config');
    },

    async upsertTeam(input) {
      const payload = teamConfigUpsertInputSchema.parse(input);
      const config = await load();
      if (registryStore) {
        if (hasConfigEntity(config, 'teams', payload.id)) {
          return result(
            'upsert',
            'team',
            payload.id,
            config,
            'blocked',
            `Team ${payload.id} is defined in config and shadows registry records.`,
          );
        }
        await registryStore.upsertTeam({
          id: payload.id,
          config: payload.config,
          updatedBy: 'auracall-config-service',
          createdBy: 'auracall-config-service',
        });
        return result('upsert', 'team', payload.id, config, 'registry');
      }
      const teams = ensureRecord(config, 'teams');
      teams[payload.id] = payload.config;
      await save(config);
      return result('upsert', 'team', payload.id, config, 'config');
    },

    async deleteTeam(id) {
      const parsedId = CONFIG_ID_SCHEMA.parse(id);
      const config = await load();
      if (registryStore) {
        if (hasConfigEntity(config, 'teams', parsedId)) {
          return result(
            'delete',
            'team',
            parsedId,
            config,
            'blocked',
            `Team ${parsedId} is defined in config and cannot be deleted through the registry write path.`,
          );
        }
        await registryStore.setTeamEnabled(parsedId, false, {
          updatedBy: 'auracall-config-service',
        });
        return result('delete', 'team', parsedId, config, 'registry');
      }
      const teams = ensureRecord(config, 'teams');
      delete teams[parsedId];
      await save(config);
      return result('delete', 'team', parsedId, config, 'config');
    },
  };
}

function createDiagnosticsResult(input: {
  effectiveConfig: MutableConfig;
  catalog: EffectiveAgentCatalog;
  configPath: string;
  registryPath: string | null;
  disabledRegistryAgents: string[];
  disabledRegistryTeams: string[];
  apiKeys: AgentConfigApiKeyDiagnosticInput[];
}): AgentConfigDiagnosticsResult {
  const configDoctor = analyzeConfigModelBridgeHealth(input.effectiveConfig);
  const issues: AgentConfigDiagnosticIssue[] = [
    ...input.catalog.conflicts.map((conflict): AgentConfigDiagnosticIssue => ({
      severity: 'info',
      code: 'registry-record-shadowed-by-config',
      kind: conflict.kind,
      id: conflict.id,
      message: `${capitalize(conflict.kind)} "${conflict.id}" exists in config and registry; config wins.`,
    })),
    ...input.disabledRegistryAgents.map((id): AgentConfigDiagnosticIssue => ({
      severity: 'info',
      code: 'disabled-registry-agent',
      kind: 'agent',
      id,
      message: `Registry agent "${id}" is disabled and absent from the effective catalog.`,
    })),
    ...input.disabledRegistryTeams.map((id): AgentConfigDiagnosticIssue => ({
      severity: 'info',
      code: 'disabled-registry-team',
      kind: 'team',
      id,
      message: `Registry team "${id}" is disabled and absent from the effective catalog.`,
    })),
    ...configDoctor.issues.map((issue): AgentConfigDiagnosticIssue => ({
      severity: issue.severity,
      code: issue.code,
      kind: issue.agent ? 'agent' : issue.team ? 'team' : 'config',
      id: issue.agent ?? issue.team ?? issue.auracallRuntimeProfile ?? issue.browserProfile,
      message: issue.message,
    })),
  ];
  const apiKeys = input.apiKeys.map((key) => createApiKeyDiagnostic(key, input.catalog));
  for (const key of apiKeys) {
    if (!key.hasSecret) {
      issues.push({
        severity: 'warning',
        code: 'api-key-secret-missing',
        kind: 'api_key',
        keyId: key.id,
        message: `API key "${key.id}" is listed but has no secret value.`,
      });
    }
    for (const agent of key.missingAgents) {
      issues.push({
        severity: 'warning',
        code: 'api-key-agent-scope-missing',
        kind: 'api_key',
        keyId: key.id,
        id: agent,
        message: `API key "${key.id}" scopes missing agent "${agent}".`,
      });
    }
    for (const team of key.missingTeams) {
      issues.push({
        severity: 'warning',
        code: 'api-key-team-scope-missing',
        kind: 'api_key',
        keyId: key.id,
        id: team,
        message: `API key "${key.id}" scopes missing team "${team}".`,
      });
    }
    for (const runtimeProfile of key.missingRuntimeProfiles) {
      issues.push({
        severity: 'warning',
        code: 'api-key-runtime-profile-scope-missing',
        kind: 'api_key',
        keyId: key.id,
        id: runtimeProfile,
        message: `API key "${key.id}" scopes missing runtime profile "${runtimeProfile}".`,
      });
    }
  }

  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    object: 'auracall_agent_registry_diagnostics',
    ok: warningCount === 0,
    configPath: input.configPath,
    registryPath: input.registryPath,
    metrics: {
      effectiveAgents: input.catalog.agents.length,
      effectiveTeams: input.catalog.teams.length,
      disabledRegistryAgents: input.disabledRegistryAgents.length,
      disabledRegistryTeams: input.disabledRegistryTeams.length,
      conflicts: input.catalog.conflicts.length,
      apiKeys: apiKeys.length,
      issues: issues.length,
      warnings: warningCount,
    },
    apiKeys,
    disabledRegistryAgents: input.disabledRegistryAgents,
    disabledRegistryTeams: input.disabledRegistryTeams,
    conflicts: input.catalog.conflicts,
    configIssues: configDoctor.issues,
    issues,
  };
}

function createApiKeyDiagnostic(
  key: AgentConfigApiKeyDiagnosticInput,
  catalog: EffectiveAgentCatalog,
): AgentConfigApiKeyDiagnostic {
  const agents = key.agents ?? [];
  const teams = key.teams ?? [];
  const services = key.services ?? [];
  const runtimeProfiles = key.runtimeProfiles ?? [];
  const effectiveAgentIds = new Set(catalog.agents.map((agent) => agent.id));
  const effectiveTeamIds = new Set(catalog.teams.map((team) => team.id));
  const effectiveRuntimeProfileIds = new Set(catalog.runtimeProfiles.map((profile) => profile.id));
  const teamAgentIds = teams
    .flatMap((teamId) => catalog.teams.find((team) => team.id === teamId)?.agentIds ?? []);
  return {
    id: key.id,
    scoped: Boolean(agents.length || teams.length || services.length || runtimeProfiles.length),
    hasSecret: key.hasSecret ?? true,
    agents,
    teams,
    services,
    runtimeProfiles,
    effectiveAgents: [...new Set([...agents, ...teamAgentIds].filter((agentId) => effectiveAgentIds.has(agentId)))].sort(),
    missingAgents: agents.filter((agentId) => !effectiveAgentIds.has(agentId)).sort(),
    missingTeams: teams.filter((teamId) => !effectiveTeamIds.has(teamId)).sort(),
    missingRuntimeProfiles: runtimeProfiles.filter((profileId) => !effectiveRuntimeProfileIds.has(profileId)).sort(),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function readWritableUserConfig(targetPath: string): Promise<MutableConfig> {
  await scaffoldDefaultConfigFile({ path: targetPath, force: false, targetShape: true });
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    const parsed = JSON5.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function createEffectiveCatalog(
  config: MutableConfig,
  registryStore: AgentRegistryStore | null,
): Promise<EffectiveAgentCatalog> {
  return createEffectiveAgentCatalog({
    config,
    registryAgents: registryStore ? await registryStore.listAgents({ includeDisabled: true }) : [],
    registryTeams: registryStore ? await registryStore.listTeams({ includeDisabled: true }) : [],
  });
}

async function createEffectiveAgentConfig(
  config: MutableConfig,
  registryStore: AgentRegistryStore | null,
): Promise<MutableConfig> {
  return createEffectiveAgentConfigRecord({
    config,
    registryAgents: registryStore ? await registryStore.listAgents({ includeDisabled: true }) : [],
    registryTeams: registryStore ? await registryStore.listTeams({ includeDisabled: true }) : [],
  });
}

async function writeJsonFile(targetPath: string, config: MutableConfig): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, targetPath);
}

function createResult(input: {
  action: ConfigEntityMutationResult['action'];
  kind: ConfigEntityMutationResult['kind'];
  id: string | null;
  path: string;
  registryPath: string | null;
  mutationTarget: ConfigEntityMutationResult['mutationTarget'];
  blockedReason: string | null;
  catalog: EffectiveAgentCatalog;
}): ConfigEntityMutationResult {
  return {
    object: 'auracall_config_entity',
    kind: input.kind,
    action: input.action,
    id: input.id,
    configPath: input.path,
    registryPath: input.registryPath,
    mutationTarget: input.mutationTarget,
    blockedReason: input.blockedReason,
    agents: input.catalog.agents,
    teams: input.catalog.teams,
    conflicts: input.catalog.conflicts,
  };
}

function ensureRecord(config: MutableConfig, key: 'agents' | 'teams'): Record<string, unknown> {
  if (!isRecord(config[key])) {
    config[key] = {};
  }
  return config[key] as Record<string, unknown>;
}

function hasConfigEntity(config: MutableConfig, key: 'agents' | 'teams', id: string): boolean {
  return isRecord(config[key]) && Object.hasOwn(config[key], id);
}

function replaceObjectContents(target: MutableConfig, source: MutableConfig): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
