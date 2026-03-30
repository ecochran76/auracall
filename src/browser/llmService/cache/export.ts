import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderCacheContext } from '../../providers/cache.js';
import type { ConversationContext } from '../../providers/domain.js';
import { resolveProviderCacheKey } from '../../providers/cache.js';
import { getAuracallHomeDir } from '../../../auracallHome.js';
import { readCacheIndex, type CacheIndexEntry } from './index.js';
import { createCacheStore, type CacheStore, type CacheStoreKind } from './store.js';

export type CacheExportFormat = 'json' | 'md' | 'html' | 'csv' | 'zip';
export type CacheExportScope = 'projects' | 'conversations' | 'conversation' | 'contexts';

export interface CacheExportOptions {
  format: CacheExportFormat;
  scope: CacheExportScope;
  projectId?: string;
  conversationId?: string;
  outputDir: string;
}

export interface CacheExportPlan {
  outputDir: string;
  entries: CacheIndexEntry[];
  format: CacheExportFormat;
  scope: CacheExportScope;
  projectId?: string;
  conversationId?: string;
}

export async function buildCacheExportPlan(
  context: ProviderCacheContext,
  options: CacheExportOptions,
): Promise<CacheExportPlan> {
  const scope = options.scope;
  let entries = await buildSqlEntriesForScope(context, scope, options);
  if (entries.length === 0) {
    const index = await readCacheIndex(context);
    entries = filterEntriesForScope(index.entries, scope, options);
  }
  if (entries.length === 0) {
    entries = await buildFallbackEntries(context, scope, options);
  }
  if (scope === 'projects' && options.projectId) {
    entries = entries.filter((entry) =>
      entry.kind === 'projects' || entry.projectId === options.projectId,
    );
  }
  if (scope === 'conversation' && options.conversationId) {
    entries = entries.filter((entry) => entry.conversationId === options.conversationId);
  }
  if (scope === 'conversations' && options.projectId) {
    const conversationIds = await resolveConversationIdsForProject(context, options.projectId);
    entries = entries.filter((entry) => {
      if (entry.kind === 'conversations') return true;
      if (
        entry.kind === 'context' ||
        entry.kind === 'conversation-files' ||
        entry.kind === 'conversation-attachments'
      ) {
        return Boolean(entry.conversationId && conversationIds.has(entry.conversationId));
      }
      return true;
    });
  }
  return {
    outputDir: path.resolve(options.outputDir),
    entries,
    format: options.format,
    scope,
    projectId: options.projectId,
    conversationId: options.conversationId,
  };
}

export async function runCacheExport(
  context: ProviderCacheContext,
  options: CacheExportOptions,
): Promise<{ outputPath: string; format: CacheExportFormat; entries: number }> {
  const plan = await buildCacheExportPlan(context, options);
  if (plan.format === 'zip') {
    const outputPath = await exportZip(context, plan);
    return { outputPath, format: plan.format, entries: plan.entries.length };
  }
  await fs.mkdir(plan.outputDir, { recursive: true });
  if (plan.format === 'json') {
    await exportJson(context, plan);
  } else if (plan.format === 'csv') {
    await exportCsv(context, plan);
  } else if (plan.format === 'md') {
    await exportMarkdown(context, plan);
  } else if (plan.format === 'html') {
    await exportHtml(context, plan);
  }
  return { outputPath: plan.outputDir, format: plan.format, entries: plan.entries.length };
}

function filterEntriesForScope(
  entries: CacheIndexEntry[],
  scope: CacheExportScope,
  options: CacheExportOptions,
): CacheIndexEntry[] {
  if (scope === 'projects') {
    return entries.filter((entry) =>
      entry.kind === 'projects' ||
      entry.kind === 'project-instructions' ||
      entry.kind === 'project-knowledge',
    );
  }
  if (scope === 'contexts') {
    return entries.filter((entry) => entry.kind === 'context');
  }
  if (scope === 'conversation') {
    const id = options.conversationId;
    return entries.filter((entry) =>
      entry.conversationId && (!id || entry.conversationId === id),
    );
  }
  return entries.filter((entry) =>
    entry.kind === 'conversations' ||
    entry.kind === 'context' ||
    entry.kind === 'conversation-files' ||
    entry.kind === 'conversation-attachments',
  );
}

async function buildFallbackEntries(
  context: ProviderCacheContext,
  scope: CacheExportScope,
  options: CacheExportOptions,
): Promise<CacheIndexEntry[]> {
  const baseDir = resolveCacheBaseDir(context);
  const now = new Date().toISOString();
  const entries: CacheIndexEntry[] = [];
  const addEntry = async (kind: CacheIndexEntry['kind'], relPath: string, extra?: Partial<CacheIndexEntry>) => {
    const full = path.join(baseDir, relPath);
    try {
      await fs.access(full);
      entries.push({
        kind,
        path: relPath,
        updatedAt: now,
        sourceUrl: context.listOptions.configuredUrl ?? null,
        ...extra,
      });
    } catch {
      // ignore missing files
    }
  };

  if (scope === 'projects') {
    await addEntry('projects', 'projects.json');
    return entries;
  }

  if (scope === 'contexts') {
    const contextsDir = path.join(baseDir, 'contexts');
    try {
      const files = await fs.readdir(contextsDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue;
        const conversationId = file.name.replace(/\.json$/i, '');
        await addEntry('context', `contexts/${file.name}`, { conversationId });
      }
    } catch {
      // ignore missing contexts dir
    }
    return entries;
  }

  if (scope === 'conversation') {
    const conversationId = options.conversationId;
    if (!conversationId) return entries;
    await addEntry('context', `contexts/${conversationId}.json`, { conversationId });
    await addEntry('conversation-files', `conversation-files/${conversationId}.json`, { conversationId });
    await addEntry(
      'conversation-attachments',
      `conversation-attachments/${conversationId}/manifest.json`,
      { conversationId },
    );
    return entries;
  }

  await addEntry('conversations', 'conversations.json');
  return entries;
}

async function exportJson(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  const store = createExportCacheStore(context);
  const baseDir = resolveCacheBaseDir(context);
  for (const entry of plan.entries) {
    const source = path.join(baseDir, entry.path);
    const target = path.join(plan.outputDir, entry.path);
    const copied = shouldCopyEntryAsIs(plan, entry)
      ? await copyEntryIfAvailable(source, target, entry.kind)
      : false;
    if (copied) continue;
    await materializeEntryToTarget(context, store, entry, target, plan);
  }
}

async function exportCsv(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  const store = createExportCacheStore(context);
  const projects = await store.readProjects(context);
  const conversations = await store.readConversations(context);
  const filteredProjects = filterProjectsById(projects.items, plan.projectId);
  const filteredConversations = filterConversationsByProject(conversations.items, plan.projectId);
  const output = plan.outputDir;
  await fs.mkdir(output, { recursive: true });
  if (plan.scope === 'projects') {
    const rows = [
      ['id', 'name', 'provider', 'url'],
      ...filteredProjects.map((item) => [
        item.id,
        item.name,
        item.provider,
        item.url ?? '',
      ]),
    ];
    await fs.writeFile(path.join(output, 'projects.csv'), rows.map(csvRow).join('\n') + '\n', 'utf8');
    return;
  }
  if (plan.scope === 'contexts' || plan.scope === 'conversation') {
    const ids = new Set(plan.entries.map((entry) => entry.conversationId).filter(Boolean));
    const rows = [['conversationId', 'provider', 'messageCount']];
    for (const id of ids) {
      if (!id) continue;
      const result = await store.readConversationContext(context, id);
      rows.push([
        id,
        context.provider,
        String(Array.isArray(result.items.messages) ? result.items.messages.length : 0),
      ]);
    }
    await fs.writeFile(path.join(output, 'contexts.csv'), rows.map(csvRow).join('\n') + '\n', 'utf8');
    return;
  }
  const rows = [
    ['id', 'title', 'provider', 'projectId', 'url', 'updatedAt'],
    ...filteredConversations.map((item) => [
      item.id,
      item.title,
      item.provider,
      item.projectId ?? '',
      item.url ?? '',
      item.updatedAt ?? '',
    ]),
  ];
  await fs.writeFile(path.join(output, 'conversations.csv'), rows.map(csvRow).join('\n') + '\n', 'utf8');
}

async function exportMarkdown(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  const store = createExportCacheStore(context);
  await fs.mkdir(plan.outputDir, { recursive: true });
  if ((plan.scope === 'conversation' || plan.scope === 'contexts') && plan.entries.length > 0) {
    const conversationIds = new Set(plan.entries.map((entry) => entry.conversationId).filter(Boolean));
    for (const id of conversationIds) {
      if (!id) continue;
      const result = await store.readConversationContext(context, id);
      const markdown = renderConversationMarkdown(result.items, id);
      await fs.writeFile(path.join(plan.outputDir, `${id}.md`), markdown, 'utf8');
    }
    return;
  }
  const conversations = await store.readConversations(context);
  const filteredConversations = filterConversationsByProject(conversations.items, plan.projectId);
  for (const conversation of filteredConversations) {
    const contextResult = await store.readConversationContext(context, conversation.id);
    const markdown = renderConversationMarkdown(contextResult.items, conversation.id);
    await fs.writeFile(path.join(plan.outputDir, `${conversation.id}.md`), markdown, 'utf8');
  }
}

async function exportHtml(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  const store = createExportCacheStore(context);
  await fs.mkdir(plan.outputDir, { recursive: true });
  if ((plan.scope === 'conversation' || plan.scope === 'contexts') && plan.entries.length > 0) {
    const conversationIds = new Set(plan.entries.map((entry) => entry.conversationId).filter(Boolean));
    for (const id of conversationIds) {
      if (!id) continue;
      const result = await store.readConversationContext(context, id);
      const html = renderConversationHtml(result.items, id);
      await fs.writeFile(path.join(plan.outputDir, `${id}.html`), html, 'utf8');
    }
    return;
  }
  const conversations = await store.readConversations(context);
  const filteredConversations = filterConversationsByProject(conversations.items, plan.projectId);
  for (const conversation of filteredConversations) {
    const contextResult = await store.readConversationContext(context, conversation.id);
    const html = renderConversationHtml(contextResult.items, conversation.id);
    await fs.writeFile(path.join(plan.outputDir, `${conversation.id}.html`), html, 'utf8');
  }
}

async function exportZip(
  context: ProviderCacheContext,
  plan: CacheExportPlan,
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cache-export-'));
  const jsonPlan: CacheExportPlan = {
    ...plan,
    format: 'json',
    outputDir: tempDir,
  };
  await exportJson(context, jsonPlan);
  const outputPath = plan.outputDir.endsWith('.zip')
    ? plan.outputDir
    : `${plan.outputDir}.zip`;
  await zipDirectory(tempDir, outputPath);
  return outputPath;
}

async function copyEntryIfAvailable(
  source: string,
  target: string,
  kind: CacheIndexEntry['kind'],
): Promise<boolean> {
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  if (kind === 'project-knowledge' || kind === 'conversation-attachments') {
    const sourceDir = path.dirname(source);
    const targetDir = path.dirname(target);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.cp(sourceDir, targetDir, { recursive: true });
    return true;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

function createExportCacheStore(context: ProviderCacheContext): CacheStore {
  const configured = context.userConfig.browser?.cache?.store;
  const kind: CacheStoreKind =
    configured === 'json' || configured === 'sqlite' || configured === 'dual'
      ? configured
      : 'dual';
  return createCacheStore(kind);
}

type SqliteLikeDatabase = {
  close(): void;
  prepare(sql: string): {
    all(...args: unknown[]): Array<Record<string, unknown>>;
  };
};

type SqliteModule = {
  DatabaseSync: new (filename: string) => SqliteLikeDatabase;
};

type SqlCacheEntryRow = {
  dataset?: unknown;
  entity_id?: unknown;
  updated_at?: unknown;
  source_url?: unknown;
};

async function buildSqlEntriesForScope(
  context: ProviderCacheContext,
  scope: CacheExportScope,
  options: CacheExportOptions,
): Promise<CacheIndexEntry[]> {
  const dbPath = path.join(resolveCacheBaseDir(context), 'cache.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return [];
  }

  try {
    const sqliteModule = (await import('node:sqlite')) as unknown as SqliteModule;
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      const where = resolveSqlScopeWhere(scope, options);
      const rows = db
        .prepare(
          `SELECT dataset, entity_id, updated_at, source_url
             FROM cache_entries
             ${where.sql}
             ORDER BY updated_at DESC`,
        )
        .all(...where.params) as SqlCacheEntryRow[];
      const entries: CacheIndexEntry[] = [];
      for (const row of rows) {
        const dataset = typeof row.dataset === 'string' ? row.dataset : '';
        const entityId = typeof row.entity_id === 'string' ? row.entity_id : '';
        const updatedAt =
          typeof row.updated_at === 'string' && row.updated_at.trim().length > 0
            ? row.updated_at
            : new Date().toISOString();
        const sourceUrl =
          typeof row.source_url === 'string' && row.source_url.trim().length > 0
            ? row.source_url
            : context.listOptions.configuredUrl ?? null;
        entries.push(...mapSqlDatasetToEntries(dataset, entityId, updatedAt, sourceUrl));
      }
      return dedupeEntries(entries);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

function resolveSqlScopeWhere(
  scope: CacheExportScope,
  options: CacheExportOptions,
): { sql: string; params: unknown[] } {
  const inClause = (values: string[]) => values.map(() => '?').join(', ');
  if (scope === 'projects') {
    const datasets = ['projects', 'project-instructions', 'project-knowledge'];
    if (options.projectId) {
      return {
        sql: `WHERE dataset IN (${inClause(datasets)}) AND (entity_id = '' OR entity_id = ?)`,
        params: [...datasets, options.projectId],
      };
    }
    return { sql: `WHERE dataset IN (${inClause(datasets)})`, params: datasets };
  }
  if (scope === 'contexts') {
    return { sql: 'WHERE dataset = ?', params: ['conversation-context'] };
  }
  if (scope === 'conversation') {
    if (!options.conversationId) {
      return { sql: 'WHERE 1=0', params: [] };
    }
    return {
      sql: `WHERE dataset IN ('conversation-context','conversation-files','conversation-attachments') AND entity_id = ?`,
      params: [options.conversationId],
    };
  }
  const datasets = ['conversations', 'conversation-context', 'conversation-files', 'conversation-attachments', 'account-files'];
  return { sql: `WHERE dataset IN (${inClause(datasets)})`, params: datasets };
}

function mapSqlDatasetToEntries(
  dataset: string,
  entityId: string,
  updatedAt: string,
  sourceUrl: string | null,
): CacheIndexEntry[] {
  if (dataset === 'projects') {
    return [{
      kind: 'projects',
      path: 'projects.json',
      updatedAt,
      sourceUrl,
    }];
  }
  if (dataset === 'conversations') {
    return [{
      kind: 'conversations',
      path: 'conversations.json',
      updatedAt,
      sourceUrl,
    }];
  }
  if (dataset === 'conversation-context' && entityId) {
    return [{
      kind: 'context',
      path: `contexts/${entityId}.json`,
      updatedAt,
      sourceUrl,
      conversationId: entityId,
    }];
  }
  if (dataset === 'conversation-files' && entityId) {
    return [{
      kind: 'conversation-files',
      path: `conversation-files/${entityId}.json`,
      updatedAt,
      sourceUrl,
      conversationId: entityId,
    }];
  }
  if (dataset === 'account-files') {
    return [{
      kind: 'account-files',
      path: 'account-files.json',
      updatedAt,
      sourceUrl,
    }];
  }
  if (dataset === 'conversation-attachments' && entityId) {
    return [{
      kind: 'conversation-attachments',
      path: `conversation-attachments/${entityId}/manifest.json`,
      updatedAt,
      sourceUrl,
      conversationId: entityId,
    }];
  }
  if (dataset === 'project-knowledge' && entityId) {
    return [{
      kind: 'project-knowledge',
      path: `project-knowledge/${entityId}/manifest.json`,
      updatedAt,
      sourceUrl,
      projectId: entityId,
    }];
  }
  if (dataset === 'project-instructions' && entityId) {
    return [
      {
        kind: 'project-instructions',
        path: `project-instructions/${entityId}.json`,
        updatedAt,
        sourceUrl,
        projectId: entityId,
      },
      {
        kind: 'project-instructions',
        path: `project-instructions/${entityId}.md`,
        updatedAt,
        sourceUrl,
        projectId: entityId,
      },
    ];
  }
  return [];
}

function dedupeEntries(entries: CacheIndexEntry[]): CacheIndexEntry[] {
  const seen = new Set<string>();
  const output: CacheIndexEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.kind}::${entry.path}::${entry.projectId ?? ''}::${entry.conversationId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}

async function materializeEntryToTarget(
  context: ProviderCacheContext,
  store: CacheStore,
  entry: CacheIndexEntry,
  targetPath: string,
  plan: CacheExportPlan,
): Promise<void> {
  if (entry.kind === 'projects') {
    const data = await store.readProjects(context);
    const filtered = filterProjectsById(data.items, plan.projectId);
    await writeJsonCachePayload(targetPath, filtered, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'conversations') {
    const data = await store.readConversations(context);
    const filtered = filterConversationsByProject(data.items, plan.projectId);
    await writeJsonCachePayload(targetPath, filtered, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'context') {
    const conversationId = entry.conversationId ?? parseConversationIdFromPath(entry.path);
    if (!conversationId) return;
    const data = await store.readConversationContext(context, conversationId);
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'conversation-files') {
    const conversationId = entry.conversationId ?? parseConversationIdFromPath(entry.path);
    if (!conversationId) return;
    const data = await store.readConversationFiles(context, conversationId);
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'conversation-attachments') {
    const conversationId = entry.conversationId ?? parseConversationIdFromPath(entry.path);
    if (!conversationId) return;
    const data = await store.readConversationAttachments(context, conversationId);
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'account-files') {
    const data = await store.readAccountFiles(context);
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'project-knowledge') {
    const projectId = entry.projectId ?? parseProjectIdFromPath(entry.path);
    if (!projectId) return;
    const data = await store.readProjectKnowledge(context, projectId);
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
    return;
  }
  if (entry.kind === 'project-instructions') {
    const projectId = entry.projectId ?? parseProjectIdFromPath(entry.path);
    if (!projectId) return;
    const data = await store.readProjectInstructions(context, projectId);
    if (targetPath.endsWith('.md')) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, `${(data.items.content ?? '').trim()}\n`, 'utf8');
      return;
    }
    await writeJsonCachePayload(targetPath, data.items, data.fetchedAt, context);
  }
}

function shouldCopyEntryAsIs(plan: CacheExportPlan, entry: CacheIndexEntry): boolean {
  if (plan.projectId && entry.kind === 'projects') return false;
  if (plan.projectId && plan.scope === 'conversations' && entry.kind === 'conversations') return false;
  return true;
}

function filterProjectsById<T extends { id: string }>(items: T[], projectId?: string): T[] {
  if (!projectId) return items;
  return items.filter((item) => item.id === projectId);
}

function filterConversationsByProject<T extends { projectId?: string | null }>(
  items: Array<T & { url?: string | null }>,
  projectId?: string,
): Array<T & { url?: string | null }> {
  if (!projectId) return items;
  return items.filter((item) => extractConversationProjectId(item) === projectId);
}

async function resolveConversationIdsForProject(
  context: ProviderCacheContext,
  projectId: string,
): Promise<Set<string>> {
  const store = createExportCacheStore(context);
  const conversations = await store.readConversations(context);
  return new Set(
    conversations.items
      .filter((item) => extractConversationProjectId(item) === projectId)
      .map((item) => item.id),
  );
}

function extractConversationProjectId(item: { projectId?: string | null; url?: string | null }): string | null {
  const explicitProjectId = typeof item.projectId === 'string' ? item.projectId.trim() : '';
  if (explicitProjectId.length > 0) return explicitProjectId;
  const url = typeof item.url === 'string' ? item.url : '';
  const match = url.match(/\/project\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

async function writeJsonCachePayload<T>(
  targetPath: string,
  items: T,
  fetchedAtMs: number | null,
  context: ProviderCacheContext,
): Promise<void> {
  const fetchedAt =
    typeof fetchedAtMs === 'number' && Number.isFinite(fetchedAtMs) && fetchedAtMs > 0
      ? new Date(fetchedAtMs).toISOString()
      : new Date().toISOString();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(
    targetPath,
    JSON.stringify(
      {
        fetchedAt,
        items,
        sourceUrl: context.listOptions.configuredUrl ?? null,
        userIdentity: context.userIdentity ?? null,
        identityKey: context.identityKey ?? null,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function parseConversationIdFromPath(relPath: string): string | null {
  const match =
    relPath.match(/^contexts\/([^.]+)\.json$/i) ??
    relPath.match(/^conversation-files\/([^.]+)\.json$/i) ??
    relPath.match(/^conversation-attachments\/([^/]+)\/manifest\.json$/i);
  return match?.[1] ?? null;
}

function parseProjectIdFromPath(relPath: string): string | null {
  const match =
    relPath.match(/^project-knowledge\/([^/]+)\/manifest\.json$/i) ??
    relPath.match(/^project-instructions\/([^.]+)\.(?:json|md)$/i);
  return match?.[1] ?? null;
}

function resolveCacheBaseDir(context: ProviderCacheContext): string {
  const cacheRoot = context.cacheRoot ?? path.join(getAuracallHomeDir(), 'cache', 'providers');
  const key = resolveProviderCacheKey(context);
  return path.join(cacheRoot, context.provider, key);
}

function csvRow(values: string[]): string {
  return values.map(csvCell).join(',');
}

function csvCell(value: string): string {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function renderConversationMarkdown(
  context: ConversationContext | null,
  conversationId: string,
): string {
  const messages = context?.messages ?? [];
  const sources = context?.sources ?? [];
  const artifacts = context?.artifacts ?? [];
  const lines: string[] = [`# Conversation ${conversationId}`, ''];
  for (const message of messages) {
    const heading = message.role ? message.role.toUpperCase() : 'MESSAGE';
    lines.push(`## ${heading}`);
    if (message.time) {
      lines.push(`_Time:_ ${message.time}`);
      lines.push('');
    }
    lines.push(message.text ?? '');
    lines.push('');
  }
  if (artifacts.length > 0) {
    lines.push('## ARTIFACTS');
    for (const artifact of artifacts) {
      const kind = artifact.kind ? ` (${artifact.kind})` : '';
      const uri = artifact.uri ? ` -> ${artifact.uri}` : '';
      lines.push(`- ${artifact.title}${kind}${uri}`);
    }
    lines.push('');
  }
  if (sources.length > 0) {
    lines.push('## SOURCES');
    for (const source of sources) {
      const title = source.title ? `${source.title} -> ` : '';
      lines.push(`- ${title}${source.url}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function renderConversationHtml(
  context: ConversationContext | null,
  conversationId: string,
): string {
  const messages = context?.messages ?? [];
  const sources = context?.sources ?? [];
  const artifacts = context?.artifacts ?? [];
  const rows = messages.map((message) => {
    const role = escapeHtml(message.role ?? '');
    const time = message.time ? `<div class="time">${escapeHtml(message.time)}</div>` : '';
    const text = escapeHtml(message.text ?? '');
    return `<section class="message"><h3>${role}</h3>${time}<pre>${text}</pre></section>`;
  });
  const artifactSection =
    artifacts.length > 0
      ? `<section class="artifacts"><h2>Artifacts</h2><ul>${artifacts
          .map((artifact) => {
            const kind = artifact.kind ? ` (${escapeHtml(artifact.kind)})` : '';
            const uri = artifact.uri ? ` <code>${escapeHtml(artifact.uri)}</code>` : '';
            return `<li>${escapeHtml(artifact.title)}${kind}${uri}</li>`;
          })
          .join('')}</ul></section>`
      : '';
  const sourceSection =
    sources.length > 0
      ? `<section class="sources"><h2>Sources</h2><ul>${sources
          .map((source) => {
            const label = source.title ? `${escapeHtml(source.title)} &rarr; ` : '';
            return `<li>${label}<code>${escapeHtml(source.url)}</code></li>`;
          })
          .join('')}</ul></section>`
      : '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Conversation ${escapeHtml(conversationId)}</title>
  <style>
    body { font-family: "Source Serif 4", "Iowan Old Style", "Times New Roman", serif; margin: 2rem; }
    .message { margin-bottom: 2rem; }
    h3 { margin-bottom: 0.25rem; }
    pre { white-space: pre-wrap; font-family: "Berkeley Mono", "Menlo", monospace; background: #f5f5f5; padding: 1rem; }
    .time { color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>Conversation ${escapeHtml(conversationId)}</h1>
  ${rows.join('\n')}
  ${artifactSection}
  ${sourceSection}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const execFileAsync = promisify(execFile);

async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  const zipBinary = 'zip';
  try {
    await execFileAsync(zipBinary, ['-r', outputPath, '.'], { cwd: sourceDir });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create zip (${zipBinary}): ${message}`);
  }
}
