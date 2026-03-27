import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ConversationContext, ConversationMessage } from '../../providers/domain.js';
import type { ProviderCacheContext } from '../../providers/cache.js';
import { resolveProviderCachePath } from '../../providers/cache.js';

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
  DatabaseSync: new (filename: string) => SqliteLikeDatabase;
};

let sqliteModulePromise: Promise<SqliteModule> | null = null;

async function loadSqliteModule(): Promise<SqliteModule> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite') as unknown as Promise<SqliteModule>;
  }
  return sqliteModulePromise;
}

type CachedContextDocument = {
  conversationId: string;
  fetchedAt: string | null;
  updatedAt: string | null;
  context: ConversationContext;
};

type ContextChunk = {
  conversationId: string;
  fetchedAt: string | null;
  updatedAt: string | null;
  messageIndex: number;
  role: ConversationMessage['role'] | 'source';
  text: string;
};

export type CacheSearchHit = {
  conversationId: string;
  messageIndex: number;
  role: ConversationMessage['role'] | 'source';
  score: number;
  snippet: string;
  updatedAt: string | null;
  fetchedAt: string | null;
};

export interface KeywordSearchOptions {
  limit?: number;
  conversationId?: string;
  role?: ConversationMessage['role'] | 'source';
}

export interface SemanticSearchOptions extends KeywordSearchOptions {
  model?: string;
  maxChunks?: number;
  minScore?: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
}

export interface SemanticSearchResult {
  model: string;
  totalChunks: number;
  embeddedChunks: number;
  hits: CacheSearchHit[];
}

export async function searchCachedContextsByKeyword(
  context: ProviderCacheContext,
  query: string,
  options: KeywordSearchOptions = {},
): Promise<CacheSearchHit[]> {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];
  const chunks = await collectContextChunks(context, options);
  const tokens = tokenize(normalizedQuery);
  const hits: CacheSearchHit[] = [];
  for (const chunk of chunks) {
    const score = keywordScore(chunk.text, normalizedQuery, tokens);
    if (score <= 0) continue;
    hits.push({
      conversationId: chunk.conversationId,
      messageIndex: chunk.messageIndex,
      role: chunk.role,
      score,
      snippet: buildSnippet(chunk.text, normalizedQuery),
      updatedAt: chunk.updatedAt,
      fetchedAt: chunk.fetchedAt,
    });
  }
  hits.sort((a, b) => (b.score - a.score) || compareTimestampDesc(a.updatedAt, b.updatedAt));
  return hits.slice(0, normalizeLimit(options.limit));
}

export async function searchCachedContextsSemantically(
  context: ProviderCacheContext,
  query: string,
  options: SemanticSearchOptions = {},
): Promise<SemanticSearchResult> {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return {
      model: options.model ?? 'text-embedding-3-small',
      totalChunks: 0,
      embeddedChunks: 0,
      hits: [],
    };
  }

  const openaiApiKey = (options.openaiApiKey ?? process.env.OPENAI_API_KEY ?? '').trim();
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required for semantic search.');
  }
  const openaiBaseUrl = (
    options.openaiBaseUrl ??
    process.env.OPENAI_BASE_URL ??
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const model = (options.model ?? 'text-embedding-3-small').trim();
  const maxChunks =
    typeof options.maxChunks === 'number' && Number.isFinite(options.maxChunks) && options.maxChunks > 0
      ? Math.floor(options.maxChunks)
      : 400;
  const minScore =
    typeof options.minScore === 'number' && Number.isFinite(options.minScore)
      ? options.minScore
      : -1;

  const chunks = await collectContextChunks(context, options);
  const limitedChunks = chunks.slice(0, maxChunks);
  if (!limitedChunks.length) {
    return { model, totalChunks: 0, embeddedChunks: 0, hits: [] };
  }

  const queryVector = await fetchEmbedding(openaiBaseUrl, openaiApiKey, model, normalizedQuery);
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  const nowIso = new Date().toISOString();
  let embeddedChunks = 0;
  try {
    if (sqlite) ensureSemanticEmbeddingTable(sqlite);
    const chunkHashes = limitedChunks.map((chunk) => hashText(chunk.text));
    const cachedVectors = sqlite
      ? readSemanticEmbeddings(sqlite, model, chunkHashes)
      : new Map<string, number[]>();

    const toEmbed = limitedChunks.filter((chunk) => !cachedVectors.has(hashText(chunk.text)));
    if (toEmbed.length > 0) {
      const newVectors = await fetchEmbeddingsBatch(
        openaiBaseUrl,
        openaiApiKey,
        model,
        toEmbed.map((chunk) => chunk.text),
      );
      embeddedChunks = newVectors.length;
      if (sqlite) {
        const stmt = sqlite.prepare(
          `INSERT INTO semantic_embeddings (text_hash, model, vector_json, text_preview, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(text_hash, model) DO UPDATE SET
             vector_json = excluded.vector_json,
             text_preview = excluded.text_preview,
             updated_at = excluded.updated_at`,
        );
        for (let i = 0; i < toEmbed.length; i += 1) {
          const chunk = toEmbed[i];
          const vector = newVectors[i];
          const textHash = hashText(chunk.text);
          cachedVectors.set(textHash, vector);
          stmt.run(
            textHash,
            model,
            JSON.stringify(vector),
            chunk.text.slice(0, 240),
            nowIso,
          );
        }
      } else {
        for (let i = 0; i < toEmbed.length; i += 1) {
          const chunk = toEmbed[i];
          cachedVectors.set(hashText(chunk.text), newVectors[i]);
        }
      }
    }

    const hits: CacheSearchHit[] = [];
    for (const chunk of limitedChunks) {
      const vector = cachedVectors.get(hashText(chunk.text));
      if (!vector) continue;
      const score = cosineSimilarity(queryVector, vector);
      if (!Number.isFinite(score) || score < minScore) continue;
      hits.push({
        conversationId: chunk.conversationId,
        messageIndex: chunk.messageIndex,
        role: chunk.role,
        score,
        snippet: chunk.text.slice(0, 280),
        updatedAt: chunk.updatedAt,
        fetchedAt: chunk.fetchedAt,
      });
    }
    hits.sort((a, b) => (b.score - a.score) || compareTimestampDesc(a.updatedAt, b.updatedAt));
    return {
      model,
      totalChunks: limitedChunks.length,
      embeddedChunks,
      hits: hits.slice(0, normalizeLimit(options.limit)),
    };
  } finally {
    sqlite?.close();
  }
}

async function collectContextChunks(
  context: ProviderCacheContext,
  options: { conversationId?: string; role?: ConversationMessage['role'] | 'source' } = {},
): Promise<ContextChunk[]> {
  const docs = await loadCachedContextDocuments(context);
  const targetConversation = options.conversationId?.trim();
  const targetRole = options.role;
  const chunks: ContextChunk[] = [];
  for (const doc of docs) {
    if (targetConversation && doc.conversationId !== targetConversation) continue;
    const messages = Array.isArray(doc.context.messages) ? doc.context.messages : [];
    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      const role = message.role;
      if (targetRole && role !== targetRole) continue;
      const text = normalizeText(message.text);
      if (!text) continue;
      chunks.push({
        conversationId: doc.conversationId,
        fetchedAt: doc.fetchedAt,
        updatedAt: doc.updatedAt,
        messageIndex: i,
        role,
        text,
      });
    }
    if (!targetRole || targetRole === 'source') {
      const sources = Array.isArray(doc.context.sources) ? doc.context.sources : [];
      for (const source of sources) {
        const text = normalizeText(
          [source.title ?? '', source.domain ?? '', source.url ?? '', source.sourceGroup ?? ''].join(' '),
        );
        if (!text) continue;
        const index =
          typeof source.messageIndex === 'number' && Number.isFinite(source.messageIndex)
            ? source.messageIndex
            : -1;
        chunks.push({
          conversationId: doc.conversationId,
          fetchedAt: doc.fetchedAt,
          updatedAt: doc.updatedAt,
          messageIndex: index,
          role: 'source',
          text,
        });
      }
    }
  }
  chunks.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return chunks;
}

async function loadCachedContextDocuments(context: ProviderCacheContext): Promise<CachedContextDocument[]> {
  const fromSqlite = await loadContextDocumentsFromSqlite(context);
  if (fromSqlite.length > 0) return fromSqlite;
  return loadContextDocumentsFromJson(context);
}

async function loadContextDocumentsFromSqlite(
  context: ProviderCacheContext,
): Promise<CachedContextDocument[]> {
  const dbPath = resolveSqlitePath(context);
  const sqlite = await tryOpenSqlite(dbPath);
  if (!sqlite) return [];
  try {
    const rows = sqlite
      .prepare(
        `SELECT entity_id, items_json, fetched_at, updated_at
           FROM cache_entries
          WHERE dataset = 'conversation-context'
          ORDER BY updated_at DESC`,
      )
      .all();
    const docs: CachedContextDocument[] = [];
    for (const row of rows) {
      const conversationId = typeof row.entity_id === 'string' ? row.entity_id : '';
      if (!conversationId) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof row.items_json === 'string' ? row.items_json : '');
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const contextPayload = parsed as ConversationContext;
      docs.push({
        conversationId,
        fetchedAt: typeof row.fetched_at === 'string' ? row.fetched_at : null,
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
        context: contextPayload,
      });
    }
    return docs;
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

async function loadContextDocumentsFromJson(
  context: ProviderCacheContext,
): Promise<CachedContextDocument[]> {
  const cacheDir = resolveProviderCachePath(context, 'projects.json').cacheDir;
  const contextsDir = path.join(cacheDir, 'contexts');
  let files: Array<{ name: string; isFile: () => boolean }> = [];
  try {
    files = await fs.readdir(contextsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const docs: CachedContextDocument[] = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    const conversationId = file.name.replace(/\.json$/i, '');
    const fullPath = path.join(contextsDir, file.name);
    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      const parsed = JSON.parse(raw) as { fetchedAt?: string; items?: ConversationContext };
      if (!parsed?.items) continue;
      docs.push({
        conversationId,
        fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
        updatedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
        context: parsed.items,
      });
    } catch {
      continue;
    }
  }
  docs.sort((a, b) => compareTimestampDesc(a.updatedAt, b.updatedAt));
  return docs;
}

function resolveSqlitePath(context: ProviderCacheContext): string {
  return path.join(resolveProviderCachePath(context, 'projects.json').cacheDir, 'cache.sqlite');
}

async function tryOpenSqlite(dbPath: string): Promise<SqliteLikeDatabase | null> {
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  try {
    const sqliteModule = await loadSqliteModule();
    return new sqliteModule.DatabaseSync(dbPath);
  } catch {
    return null;
  }
}

function keywordScore(text: string, fullQuery: string, tokens: string[]): number {
  const haystack = text.toLowerCase();
  if (!haystack) return 0;
  let score = 0;
  if (haystack.includes(fullQuery)) score += 10;
  for (const token of tokens) {
    const matches = haystack.match(new RegExp(escapeRegExp(token), 'g'));
    if (!matches) continue;
    score += matches.length;
    if (haystack.startsWith(token)) score += 0.5;
  }
  return score;
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9_\-.:/]/g, ''))
        .filter((token) => token.length >= 2),
    ),
  );
}

function normalizeText(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 20;
  return Math.min(200, Math.floor(value));
}

function buildSnippet(text: string, query: string): string {
  const normalized = text.slice(0, 400);
  const lower = normalized.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0 || normalized.length <= 220) return normalized.slice(0, 220);
  const start = Math.max(0, idx - 80);
  const end = Math.min(normalized.length, idx + query.length + 120);
  return normalized.slice(start, end);
}

function compareTimestampDesc(a: string | null, b: string | null): number {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return tb - ta;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 48);
}

function ensureSemanticEmbeddingTable(db: SqliteLikeDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_embeddings (
      text_hash TEXT NOT NULL,
      model TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      text_preview TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (text_hash, model)
    );
  `);
}

function readSemanticEmbeddings(
  db: SqliteLikeDatabase,
  model: string,
  hashes: string[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (!hashes.length) return map;
  const uniqueHashes = Array.from(new Set(hashes));
  const batchSize = 200;
  for (let i = 0; i < uniqueHashes.length; i += batchSize) {
    const batch = uniqueHashes.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT text_hash, vector_json
           FROM semantic_embeddings
          WHERE model = ? AND text_hash IN (${placeholders})`,
      )
      .all(model, ...batch);
    for (const row of rows) {
      const hash = typeof row.text_hash === 'string' ? row.text_hash : '';
      if (!hash) continue;
      try {
        const vector = JSON.parse(typeof row.vector_json === 'string' ? row.vector_json : '[]');
        if (Array.isArray(vector)) {
          map.set(
            hash,
            vector.filter((value) => typeof value === 'number' && Number.isFinite(value)),
          );
        }
      } catch {
        continue;
      }
    }
  }
  return map;
}

async function fetchEmbedding(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: string,
): Promise<number[]> {
  const vectors = await fetchEmbeddingsBatch(baseUrl, apiKey, model, [input]);
  if (!vectors.length) {
    throw new Error('Embedding response returned no vectors.');
  }
  return vectors[0];
}

async function fetchEmbeddingsBatch(
  baseUrl: string,
  apiKey: string,
  model: string,
  inputs: string[],
): Promise<number[][]> {
  const output: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: batch,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embeddings API request failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const parsed = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vectors =
      Array.isArray(parsed.data)
        ? parsed.data.map((item) =>
            Array.isArray(item.embedding)
              ? item.embedding.filter((v) => typeof v === 'number' && Number.isFinite(v))
              : [],
          )
        : [];
    output.push(...vectors);
  }
  return output;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
