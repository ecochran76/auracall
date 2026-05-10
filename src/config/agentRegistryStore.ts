import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { getAuracallHomeDir } from '../auracallHome.js';
import { AgentConfigSchema, TeamConfigSchema } from '../schema/types.js';

type SqliteLikeDatabase = {
  exec(sql: string): unknown;
  close(): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Array<Record<string, unknown>>;
  };
};

type SqliteModule = {
  // biome-ignore lint/style/useNamingConvention: node:sqlite exposes this constructor as DatabaseSync.
  DatabaseSync: new (filename: string) => SqliteLikeDatabase;
};

type AgentConfig = z.infer<typeof AgentConfigSchema>;
type TeamConfig = z.infer<typeof TeamConfigSchema>;
type RegistryKind = 'agent' | 'team';
type RegistrySource = 'registry' | 'config_seed' | 'import';

let sqliteModulePromise: Promise<SqliteModule | null> | null = null;

export interface AgentRegistryRecordBase<TConfig> {
  id: string;
  config: TConfig;
  source: RegistrySource;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  revision: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentRegistryAgentRecord extends AgentRegistryRecordBase<AgentConfig> {
  kind: 'agent';
}

export interface AgentRegistryTeamRecord extends AgentRegistryRecordBase<TeamConfig> {
  kind: 'team';
}

export interface AgentRegistryStore {
  dbPath: string;
  listAgents(options?: { includeDisabled?: boolean }): Promise<AgentRegistryAgentRecord[]>;
  listTeams(options?: { includeDisabled?: boolean }): Promise<AgentRegistryTeamRecord[]>;
  upsertAgent(input: AgentRegistryUpsertInput<AgentConfig>): Promise<AgentRegistryAgentRecord>;
  upsertTeam(input: AgentRegistryUpsertInput<TeamConfig>): Promise<AgentRegistryTeamRecord>;
  setAgentEnabled(id: string, enabled: boolean, options?: AgentRegistryMutationOptions): Promise<AgentRegistryAgentRecord | null>;
  setTeamEnabled(id: string, enabled: boolean, options?: AgentRegistryMutationOptions): Promise<AgentRegistryTeamRecord | null>;
}

export interface AgentRegistryStoreOptions {
  dbPath?: string;
  rootDir?: string;
  now?: () => Date;
  forceJsonFallbackForTest?: boolean;
}

interface AgentRegistryMutationOptions {
  updatedBy?: string | null;
  now?: string | null;
}

interface AgentRegistryUpsertInput<TConfig> extends AgentRegistryMutationOptions {
  id: string;
  config: TConfig;
  source?: RegistrySource | null;
  enabled?: boolean | null;
  createdBy?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

interface StoredRecord<TConfig> {
  id: string;
  config: TConfig;
  source: RegistrySource;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  revision: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

const REGISTRY_SCHEMA_VERSION = 1;
const JSON_FALLBACK_FILENAME = 'agents.json';

export function resolveAgentRegistryDbPath(options: {
  dbPath?: string;
  rootDir?: string;
} = {}): string {
  return options.dbPath ?? path.join(options.rootDir ?? getAuracallHomeDir(), 'registry', 'agents.sqlite');
}

export function createAgentRegistryStore(options: AgentRegistryStoreOptions = {}): AgentRegistryStore {
  const dbPath = resolveAgentRegistryDbPath(options);
  const now = options.now ?? (() => new Date());
  const jsonPath = path.join(path.dirname(dbPath), JSON_FALLBACK_FILENAME);

  const withStore = async <T>(work: (backend: RegistryBackend) => Promise<T>): Promise<T> => {
    const backend = options.forceJsonFallbackForTest ? null : await loadSqliteModule();
    if (!backend) {
      return work(createJsonBackend(jsonPath, now));
    }
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const db = new backend.DatabaseSync(dbPath);
    try {
      initializeDatabase(db);
      return await work(createSqliteBackend(db, now));
    } finally {
      db.close();
    }
  };

  return {
    dbPath,
    listAgents(options = {}) {
      return withStore((backend) => backend.listAgents(options));
    },
    listTeams(options = {}) {
      return withStore((backend) => backend.listTeams(options));
    },
    upsertAgent(input) {
      const parsedConfig = AgentConfigSchema.parse(input.config);
      return withStore((backend) => backend.upsertAgent({ ...input, config: parsedConfig }));
    },
    upsertTeam(input) {
      const parsedConfig = TeamConfigSchema.parse(input.config);
      return withStore((backend) => backend.upsertTeam({ ...input, config: parsedConfig }));
    },
    setAgentEnabled(id, enabled, options = {}) {
      return withStore((backend) => backend.setAgentEnabled(id, enabled, options));
    },
    setTeamEnabled(id, enabled, options = {}) {
      return withStore((backend) => backend.setTeamEnabled(id, enabled, options));
    },
  };
}

interface RegistryBackend {
  listAgents(options: { includeDisabled?: boolean }): Promise<AgentRegistryAgentRecord[]>;
  listTeams(options: { includeDisabled?: boolean }): Promise<AgentRegistryTeamRecord[]>;
  upsertAgent(input: AgentRegistryUpsertInput<AgentConfig>): Promise<AgentRegistryAgentRecord>;
  upsertTeam(input: AgentRegistryUpsertInput<TeamConfig>): Promise<AgentRegistryTeamRecord>;
  setAgentEnabled(id: string, enabled: boolean, options: AgentRegistryMutationOptions): Promise<AgentRegistryAgentRecord | null>;
  setTeamEnabled(id: string, enabled: boolean, options: AgentRegistryMutationOptions): Promise<AgentRegistryTeamRecord | null>;
}

function createSqliteBackend(db: SqliteLikeDatabase, now: () => Date): RegistryBackend {
  return {
    async listAgents(options) {
      return listSqlRecords(db, 'agent_records', AgentConfigSchema, 'agent', options.includeDisabled);
    },
    async listTeams(options) {
      return listSqlRecords(db, 'team_records', TeamConfigSchema, 'team', options.includeDisabled);
    },
    async upsertAgent(input) {
      return upsertSqlRecord(db, 'agent_records', 'agent', AgentConfigSchema, input, now);
    },
    async upsertTeam(input) {
      return upsertSqlRecord(db, 'team_records', 'team', TeamConfigSchema, input, now);
    },
    async setAgentEnabled(id, enabled, options) {
      return setSqlRecordEnabled(db, 'agent_records', 'agent', AgentConfigSchema, id, enabled, options, now);
    },
    async setTeamEnabled(id, enabled, options) {
      return setSqlRecordEnabled(db, 'team_records', 'team', TeamConfigSchema, id, enabled, options, now);
    },
  };
}

function initializeDatabase(db: SqliteLikeDatabase): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_records (
      id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      source TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT,
      revision INTEGER NOT NULL,
      tags_json TEXT,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS team_records (
      id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      source TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT,
      revision INTEGER NOT NULL,
      tags_json TEXT,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_revisions (
      revision_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      config_json TEXT NOT NULL,
      source TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT,
      tags_json TEXT,
      metadata_json TEXT
    );
  `);
  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations(version, description, applied_at)
    VALUES (?, ?, ?)
  `).run(REGISTRY_SCHEMA_VERSION, 'initial agent registry schema', new Date().toISOString());
}

function listSqlRecords<TConfig, TKind extends RegistryKind>(
  db: SqliteLikeDatabase,
  tableName: 'agent_records' | 'team_records',
  schema: z.ZodType<TConfig>,
  kind: TKind,
  includeDisabled = false,
): Promise<Array<AgentRegistryRecordBase<TConfig> & { kind: TKind }>> {
  const rows = db.prepare(`
    SELECT * FROM ${tableName}
    ${includeDisabled ? '' : 'WHERE enabled = 1'}
    ORDER BY id
  `).all();
  return Promise.resolve(rows.map((row) => parseSqlRecord(row, schema, kind)));
}

function upsertSqlRecord<TConfig, TKind extends RegistryKind>(
  db: SqliteLikeDatabase,
  tableName: 'agent_records' | 'team_records',
  kind: TKind,
  schema: z.ZodType<TConfig>,
  input: AgentRegistryUpsertInput<TConfig>,
  now: () => Date,
): Promise<AgentRegistryRecordBase<TConfig> & { kind: TKind }> {
  const id = normalizeRegistryId(input.id);
  const updatedAt = normalizeIsoString(input.now) ?? now().toISOString();
  const existingRow = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
  const existing = existingRow ? parseSqlRecord(existingRow, schema, kind) : null;
  if (existing) {
    writeRevision(db, kind, existing, input.updatedBy ?? null, updatedAt);
  }
  const record: StoredRecord<TConfig> = {
    id,
    config: schema.parse(input.config),
    source: input.source ?? existing?.source ?? 'registry',
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    ...(input.createdBy || existing?.createdBy ? { createdBy: input.createdBy ?? existing?.createdBy } : {}),
    ...(input.updatedBy || existing?.updatedBy ? { updatedBy: input.updatedBy ?? existing?.updatedBy } : {}),
    revision: existing ? existing.revision + 1 : 1,
    ...(input.tags || existing?.tags ? { tags: input.tags ?? existing?.tags } : {}),
    ...(input.metadata || existing?.metadata ? { metadata: input.metadata ?? existing?.metadata } : {}),
  };
  db.prepare(`
    INSERT INTO ${tableName} (
      id, config_json, source, enabled, created_at, updated_at, created_by,
      updated_by, revision, tags_json, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      config_json = excluded.config_json,
      source = excluded.source,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      revision = excluded.revision,
      tags_json = excluded.tags_json,
      metadata_json = excluded.metadata_json
  `).run(...serializeSqlRecord(record));
  return Promise.resolve({ ...record, kind });
}

function setSqlRecordEnabled<TConfig, TKind extends RegistryKind>(
  db: SqliteLikeDatabase,
  tableName: 'agent_records' | 'team_records',
  kind: TKind,
  schema: z.ZodType<TConfig>,
  id: string,
  enabled: boolean,
  options: AgentRegistryMutationOptions,
  now: () => Date,
): Promise<(AgentRegistryRecordBase<TConfig> & { kind: TKind }) | null> {
  const normalizedId = normalizeRegistryId(id);
  const existingRow = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(normalizedId);
  if (!existingRow) return Promise.resolve(null);
  const existing = parseSqlRecord(existingRow, schema, kind);
  return upsertSqlRecord(db, tableName, kind, schema, {
    id: normalizedId,
    config: existing.config,
    source: existing.source,
    enabled,
    createdBy: existing.createdBy,
    updatedBy: options.updatedBy ?? existing.updatedBy,
    tags: existing.tags ?? null,
    metadata: existing.metadata ?? null,
    now: options.now,
  }, now);
}

function parseSqlRecord<TConfig, TKind extends RegistryKind>(
  row: Record<string, unknown>,
  schema: z.ZodType<TConfig>,
  kind: TKind,
): AgentRegistryRecordBase<TConfig> & { kind: TKind } {
  const id = readString(row.id, 'id');
  const config = schema.parse(JSON.parse(readString(row.config_json, 'config_json')));
  const source = parseRegistrySource(readString(row.source, 'source'));
  const enabled = Number(row.enabled) !== 0;
  const createdAt = readString(row.created_at, 'created_at');
  const updatedAt = readString(row.updated_at, 'updated_at');
  const revision = Number(row.revision);
  return {
    kind,
    id,
    config,
    source,
    enabled,
    createdAt,
    updatedAt,
    ...(typeof row.created_by === 'string' && row.created_by ? { createdBy: row.created_by } : {}),
    ...(typeof row.updated_by === 'string' && row.updated_by ? { updatedBy: row.updated_by } : {}),
    revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
    ...parseOptionalJsonArray(row.tags_json, 'tags'),
    ...parseOptionalJsonObject(row.metadata_json, 'metadata'),
  };
}

function serializeSqlRecord<TConfig>(record: StoredRecord<TConfig>): unknown[] {
  return [
    record.id,
    JSON.stringify(record.config),
    record.source,
    record.enabled ? 1 : 0,
    record.createdAt,
    record.updatedAt,
    record.createdBy ?? null,
    record.updatedBy ?? null,
    record.revision,
    record.tags ? JSON.stringify(record.tags) : null,
    record.metadata ? JSON.stringify(record.metadata) : null,
  ];
}

function writeRevision<TConfig>(
  db: SqliteLikeDatabase,
  kind: RegistryKind,
  record: AgentRegistryRecordBase<TConfig> & { kind: RegistryKind },
  changedBy: string | null,
  changedAt: string,
): void {
  db.prepare(`
    INSERT INTO agent_revisions (
      revision_id, kind, record_id, revision, config_json, source, enabled,
      created_at, updated_at, changed_at, changed_by, tags_json, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    kind,
    record.id,
    record.revision,
    JSON.stringify(record.config),
    record.source,
    record.enabled ? 1 : 0,
    record.createdAt,
    record.updatedAt,
    changedAt,
    changedBy,
    record.tags ? JSON.stringify(record.tags) : null,
    record.metadata ? JSON.stringify(record.metadata) : null,
  );
}

function createJsonBackend(jsonPath: string, now: () => Date): RegistryBackend {
  return {
    async listAgents(options) {
      const state = await readJsonState(jsonPath);
      return Object.values(state.agents)
        .filter((record) => options.includeDisabled || record.enabled)
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    async listTeams(options) {
      const state = await readJsonState(jsonPath);
      return Object.values(state.teams)
        .filter((record) => options.includeDisabled || record.enabled)
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    async upsertAgent(input) {
      const state = await readJsonState(jsonPath);
      const record = upsertJsonRecord(state.agents, 'agent', AgentConfigSchema.parse(input.config), input, now);
      await writeJsonState(jsonPath, state);
      return record;
    },
    async upsertTeam(input) {
      const state = await readJsonState(jsonPath);
      const record = upsertJsonRecord(state.teams, 'team', TeamConfigSchema.parse(input.config), input, now);
      await writeJsonState(jsonPath, state);
      return record;
    },
    async setAgentEnabled(id, enabled, options) {
      const state = await readJsonState(jsonPath);
      const existing = state.agents[normalizeRegistryId(id)];
      if (!existing) return null;
      const record = upsertJsonRecord(state.agents, 'agent', existing.config, {
        id,
        config: existing.config,
        enabled,
        source: existing.source,
        createdBy: existing.createdBy,
        updatedBy: options.updatedBy,
        tags: existing.tags ?? null,
        metadata: existing.metadata ?? null,
        now: options.now,
      }, now);
      await writeJsonState(jsonPath, state);
      return record;
    },
    async setTeamEnabled(id, enabled, options) {
      const state = await readJsonState(jsonPath);
      const existing = state.teams[normalizeRegistryId(id)];
      if (!existing) return null;
      const record = upsertJsonRecord(state.teams, 'team', existing.config, {
        id,
        config: existing.config,
        enabled,
        source: existing.source,
        createdBy: existing.createdBy,
        updatedBy: options.updatedBy,
        tags: existing.tags ?? null,
        metadata: existing.metadata ?? null,
        now: options.now,
      }, now);
      await writeJsonState(jsonPath, state);
      return record;
    },
  };
}

interface JsonRegistryState {
  agents: Record<string, AgentRegistryAgentRecord>;
  teams: Record<string, AgentRegistryTeamRecord>;
}

async function readJsonState(jsonPath: string): Promise<JsonRegistryState> {
  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as Partial<JsonRegistryState>;
    return {
      agents: parseJsonRecordMap(parsed.agents, AgentConfigSchema, 'agent'),
      teams: parseJsonRecordMap(parsed.teams, TeamConfigSchema, 'team'),
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return { agents: {}, teams: {} };
    }
    throw error;
  }
}

async function writeJsonState(jsonPath: string, state: JsonRegistryState): Promise<void> {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  const tempPath = `${jsonPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, jsonPath);
}

function parseJsonRecordMap<TConfig, TKind extends RegistryKind>(
  value: unknown,
  schema: z.ZodType<TConfig>,
  kind: TKind,
): Record<string, AgentRegistryRecordBase<TConfig> & { kind: TKind }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const records: Record<string, AgentRegistryRecordBase<TConfig> & { kind: TKind }> = {};
  for (const [id, rawRecord] of Object.entries(value)) {
    if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue;
    const record = rawRecord as Record<string, unknown>;
    records[id] = {
      kind,
      id,
      config: schema.parse(record.config),
      source: parseRegistrySource(typeof record.source === 'string' ? record.source : 'registry'),
      enabled: record.enabled !== false,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
      ...(typeof record.createdBy === 'string' ? { createdBy: record.createdBy } : {}),
      ...(typeof record.updatedBy === 'string' ? { updatedBy: record.updatedBy } : {}),
      revision: typeof record.revision === 'number' && record.revision > 0 ? record.revision : 1,
      ...(Array.isArray(record.tags) ? { tags: record.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
      ...(isPlainRecord(record.metadata) ? { metadata: record.metadata } : {}),
    };
  }
  return records;
}

function upsertJsonRecord<TConfig, TRecord extends AgentRegistryRecordBase<TConfig> & { kind: RegistryKind }>(
  target: Record<string, TRecord>,
  kind: RegistryKind,
  config: TConfig,
  input: AgentRegistryUpsertInput<TConfig>,
  now: () => Date,
): TRecord {
  const id = normalizeRegistryId(input.id);
  const updatedAt = normalizeIsoString(input.now) ?? now().toISOString();
  const existing = target[id];
  const record = {
    kind,
    id,
    config,
    source: input.source ?? existing?.source ?? 'registry',
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    ...(input.createdBy || existing?.createdBy ? { createdBy: input.createdBy ?? existing?.createdBy } : {}),
    ...(input.updatedBy || existing?.updatedBy ? { updatedBy: input.updatedBy ?? existing?.updatedBy } : {}),
    revision: existing ? existing.revision + 1 : 1,
    ...(input.tags || existing?.tags ? { tags: input.tags ?? existing?.tags } : {}),
    ...(input.metadata || existing?.metadata ? { metadata: input.metadata ?? existing?.metadata } : {}),
  } as TRecord;
  target[id] = record;
  return record;
}

async function loadSqliteModule(): Promise<SqliteModule | null> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite')
      .then((module) => module as SqliteModule)
      .catch(() => null);
  }
  return sqliteModulePromise;
}

function normalizeRegistryId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error('Registry id must use only letters, numbers, dot, underscore, colon, or hyphen.');
  }
  return normalized;
}

function normalizeIsoString(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRegistrySource(value: string): RegistrySource {
  return value === 'config_seed' || value === 'import' ? value : 'registry';
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid registry ${label}.`);
  }
  return value;
}

function parseOptionalJsonArray(value: unknown, key: 'tags'): { tags?: string[] } {
  if (typeof value !== 'string' || !value) return {};
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? { [key]: parsed.filter((item): item is string => typeof item === 'string') } : {};
}

function parseOptionalJsonObject(value: unknown, key: 'metadata'): { metadata?: Record<string, unknown> } {
  if (typeof value !== 'string' || !value) return {};
  const parsed = JSON.parse(value) as unknown;
  return isPlainRecord(parsed) ? { [key]: parsed } : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
