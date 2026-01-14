import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderCacheContext } from '../../providers/cache.js';
import {
  readConversationCache,
  readConversationContextCache,
  readProjectCache,
  resolveProviderCacheKey,
} from '../../providers/cache.js';
import { getOracleHomeDir } from '../../../oracleHome.js';
import { readCacheIndex, type CacheIndexEntry } from './index.js';

export type CacheExportFormat = 'json' | 'md' | 'html' | 'csv' | 'zip';
export type CacheExportScope = 'projects' | 'conversations' | 'conversation';

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
}

export async function buildCacheExportPlan(
  context: ProviderCacheContext,
  options: CacheExportOptions,
): Promise<CacheExportPlan> {
  const index = await readCacheIndex(context);
  const scope = options.scope;
  let entries = filterEntriesForScope(index.entries, scope, options);
  if (entries.length === 0) {
    entries = await buildFallbackEntries(context, scope, options);
  }
  if (scope === 'projects' && options.projectId) {
    entries = entries.filter((entry) => entry.projectId === options.projectId);
  }
  if (scope === 'conversation' && options.conversationId) {
    entries = entries.filter((entry) => entry.conversationId === options.conversationId);
  }
  return {
    outputDir: path.resolve(options.outputDir),
    entries,
    format: options.format,
    scope,
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
  const baseDir = resolveCacheBaseDir(context);
  for (const entry of plan.entries) {
    const source = path.join(baseDir, entry.path);
    const target = path.join(plan.outputDir, entry.path);
    await copyEntry(source, target, entry.kind);
  }
}

async function exportCsv(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  const projects = await readProjectCache(context);
  const conversations = await readConversationCache(context);
  const output = plan.outputDir;
  await fs.mkdir(output, { recursive: true });
  if (plan.scope === 'projects') {
    const rows = [
      ['id', 'name', 'provider', 'url'],
      ...projects.items.map((item) => [
        item.id,
        item.name,
        item.provider,
        item.url ?? '',
      ]),
    ];
    await fs.writeFile(path.join(output, 'projects.csv'), rows.map(csvRow).join('\n') + '\n', 'utf8');
    return;
  }
  const rows = [
    ['id', 'title', 'provider', 'projectId', 'url', 'updatedAt'],
    ...conversations.items.map((item) => [
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
  await fs.mkdir(plan.outputDir, { recursive: true });
  if (plan.scope === 'conversation' && plan.entries.length > 0) {
    const conversationIds = new Set(plan.entries.map((entry) => entry.conversationId).filter(Boolean));
    for (const id of conversationIds) {
      if (!id) continue;
      const result = await readConversationContextCache(context, id);
      const markdown = renderConversationMarkdown(result.items, id);
      await fs.writeFile(path.join(plan.outputDir, `${id}.md`), markdown, 'utf8');
    }
    return;
  }
  const conversations = await readConversationCache(context);
  for (const conversation of conversations.items) {
    const contextResult = await readConversationContextCache(context, conversation.id);
    const markdown = renderConversationMarkdown(contextResult.items, conversation.id);
    await fs.writeFile(path.join(plan.outputDir, `${conversation.id}.md`), markdown, 'utf8');
  }
}

async function exportHtml(context: ProviderCacheContext, plan: CacheExportPlan): Promise<void> {
  await fs.mkdir(plan.outputDir, { recursive: true });
  if (plan.scope === 'conversation' && plan.entries.length > 0) {
    const conversationIds = new Set(plan.entries.map((entry) => entry.conversationId).filter(Boolean));
    for (const id of conversationIds) {
      if (!id) continue;
      const result = await readConversationContextCache(context, id);
      const html = renderConversationHtml(result.items, id);
      await fs.writeFile(path.join(plan.outputDir, `${id}.html`), html, 'utf8');
    }
    return;
  }
  const conversations = await readConversationCache(context);
  for (const conversation of conversations.items) {
    const contextResult = await readConversationContextCache(context, conversation.id);
    const html = renderConversationHtml(contextResult.items, conversation.id);
    await fs.writeFile(path.join(plan.outputDir, `${conversation.id}.html`), html, 'utf8');
  }
}

async function exportZip(
  context: ProviderCacheContext,
  plan: CacheExportPlan,
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-cache-export-'));
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

async function copyEntry(source: string, target: string, kind: CacheIndexEntry['kind']): Promise<void> {
  if (kind === 'project-knowledge' || kind === 'conversation-attachments') {
    const sourceDir = path.dirname(source);
    const targetDir = path.dirname(target);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.cp(sourceDir, targetDir, { recursive: true });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function resolveCacheBaseDir(context: ProviderCacheContext): string {
  const cacheRoot = context.cacheRoot ?? path.join(getOracleHomeDir(), 'cache', 'providers');
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
  context: { messages?: Array<{ role: string; text: string; time?: string }> } | null,
  conversationId: string,
): string {
  const messages = context?.messages ?? [];
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
  return lines.join('\n').trimEnd() + '\n';
}

function renderConversationHtml(
  context: { messages?: Array<{ role: string; text: string; time?: string }> } | null,
  conversationId: string,
): string {
  const messages = context?.messages ?? [];
  const rows = messages.map((message) => {
    const role = escapeHtml(message.role ?? '');
    const time = message.time ? `<div class="time">${escapeHtml(message.time)}</div>` : '';
    const text = escapeHtml(message.text ?? '');
    return `<section class="message"><h3>${role}</h3>${time}<pre>${text}</pre></section>`;
  });
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
