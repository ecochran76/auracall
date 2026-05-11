import fs from 'node:fs/promises';
import path from 'node:path';
import JSON5 from 'json5';
import { z } from 'zod';
import { configPath, scaffoldDefaultConfigFile } from '../config.js';
import { AgentConfigSchema, TeamConfigSchema } from '../schema/types.js';
import type { ProjectedAgent, ProjectedTeam } from './model.js';
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

export interface AgentTeamConfigServiceDeps {
  configPath?: string;
  activeConfig?: MutableConfig | null;
  registryStore?: AgentRegistryStore | null;
}

export interface AgentTeamConfigService {
  list(kind?: 'agent' | 'team'): Promise<ConfigEntityMutationResult>;
  effectiveConfig(): Promise<MutableConfig>;
  effectiveCatalog(): Promise<EffectiveAgentCatalog>;
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
