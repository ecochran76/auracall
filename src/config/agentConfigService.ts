import fs from 'node:fs/promises';
import path from 'node:path';
import JSON5 from 'json5';
import { z } from 'zod';
import { configPath, scaffoldDefaultConfigFile } from '../config.js';
import { AgentConfigSchema, TeamConfigSchema } from '../schema/types.js';
import { projectConfigModel, type ProjectedAgent, type ProjectedTeam } from './model.js';

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
  agents: ProjectedAgent[];
  teams: ProjectedTeam[];
}

export interface AgentTeamConfigServiceDeps {
  configPath?: string;
  activeConfig?: MutableConfig | null;
}

export interface AgentTeamConfigService {
  list(kind?: 'agent' | 'team'): Promise<ConfigEntityMutationResult>;
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

  const load = () => readWritableUserConfig(targetPath);
  const save = async (next: MutableConfig) => {
    await writeJsonFile(targetPath, next);
    if (activeConfig) {
      replaceObjectContents(activeConfig, next);
    }
  };
  const result = (
    action: ConfigEntityMutationResult['action'],
    kind: ConfigEntityMutationResult['kind'],
    id: string | null,
    config: MutableConfig,
  ) => createResult({ action, kind, id, path: targetPath, config });

  return {
    async list(kind = 'agent') {
      const config = await load();
      return result('list', kind, null, config);
    },

    async upsertAgent(input) {
      const payload = agentConfigUpsertInputSchema.parse(input);
      const config = await load();
      const agents = ensureRecord(config, 'agents');
      agents[payload.id] = payload.config;
      await save(config);
      return result('upsert', 'agent', payload.id, config);
    },

    async deleteAgent(id) {
      const parsedId = CONFIG_ID_SCHEMA.parse(id);
      const config = await load();
      const agents = ensureRecord(config, 'agents');
      delete agents[parsedId];
      await save(config);
      return result('delete', 'agent', parsedId, config);
    },

    async upsertTeam(input) {
      const payload = teamConfigUpsertInputSchema.parse(input);
      const config = await load();
      const teams = ensureRecord(config, 'teams');
      teams[payload.id] = payload.config;
      await save(config);
      return result('upsert', 'team', payload.id, config);
    },

    async deleteTeam(id) {
      const parsedId = CONFIG_ID_SCHEMA.parse(id);
      const config = await load();
      const teams = ensureRecord(config, 'teams');
      delete teams[parsedId];
      await save(config);
      return result('delete', 'team', parsedId, config);
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
  config: MutableConfig;
}): ConfigEntityMutationResult {
  const projection = projectConfigModel(input.config);
  return {
    object: 'auracall_config_entity',
    kind: input.kind,
    action: input.action,
    id: input.id,
    configPath: input.path,
    agents: projection.agents,
    teams: projection.teams,
  };
}

function ensureRecord(config: MutableConfig, key: 'agents' | 'teams'): Record<string, unknown> {
  if (!isRecord(config[key])) {
    config[key] = {};
  }
  return config[key] as Record<string, unknown>;
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
