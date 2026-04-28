import { describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const INTEGRATION_TIMEOUT = process.platform === 'win32' ? 60000 : 30000;

function parseJsonPayload(stdout: string): unknown {
  const trimmed = stdout.trim();
  const firstJsonIndex = trimmed.search(/[[{]/);
  if (firstJsonIndex < 0) {
    throw new Error(`Could not locate JSON payload in stdout: ${trimmed}`);
  }
  return JSON.parse(trimmed.slice(firstJsonIndex));
}

async function seedGeminiCacheHome(options?: { withSqliteArtifactParity?: boolean }): Promise<string> {
  const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'auracall-cache-gemini-'));
  const configPath = path.join(auracallHome, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      browser: {
        target: 'gemini',
        cache: {
          identityKey: 'tester@example.com',
          store: 'json',
        },
      },
    }),
    'utf8',
  );

  const cacheDir = path.join(
    auracallHome,
    'cache',
    'providers',
    'gemini',
    'tester@example.com',
  );
  await mkdir(path.join(cacheDir, 'contexts'), { recursive: true });
  const fetchedAt = '2026-04-05T12:00:00.000Z';
  await writeFile(
    path.join(cacheDir, 'projects.json'),
    JSON.stringify({
      fetchedAt,
      identityKey: 'tester@example.com',
      items: [
        {
          id: '84a7f7d4768c',
          name: 'AuraCall',
          provider: 'gemini',
          url: 'https://gemini.google.com/gem/84a7f7d4768c',
        },
      ],
    }),
    'utf8',
  );
  await writeFile(
    path.join(cacheDir, 'conversations.json'),
    JSON.stringify({
      fetchedAt,
      identityKey: 'tester@example.com',
      items: [
        {
          id: 'ab30a4a92e4b65a9',
          title: 'Cached Gemini Conversation',
          provider: 'gemini',
          url: 'https://gemini.google.com/app/ab30a4a92e4b65a9',
        },
      ],
    }),
    'utf8',
  );
  await writeFile(
    path.join(cacheDir, 'contexts', 'ab30a4a92e4b65a9.json'),
    JSON.stringify({
      fetchedAt,
      items: {
        provider: 'gemini',
        conversationId: 'ab30a4a92e4b65a9',
        messages: [
          { role: 'user', text: 'hello cached gemini search target' },
          { role: 'assistant', text: 'hi with attached AGENTS reference' },
        ],
        sources: [
          {
            url: 'https://example.com/agents',
            title: 'AGENTS guide',
            domain: 'example.com',
            messageIndex: 1,
            sourceGroup: 'Searched web',
          },
        ],
        files: [
          {
            id: 'file_agents_md',
            name: 'AGENTS.md',
            provider: 'gemini',
            source: 'conversation',
            localPath: 'missing/AGENTS.md',
            mimeType: 'text/markdown',
          },
        ],
        artifacts: [
          {
            id: 'artifact_sheet_1',
            title: 'AGENTS extraction',
            kind: 'spreadsheet',
            uri: 'sandbox:/mnt/data/agents.csv',
            messageIndex: 1,
            messageId: 'msg_artifact_1',
            metadata: {
              format: 'csv',
              source: 'gemini',
            },
          },
        ],
      },
    }),
    'utf8',
  );
  await writeFile(
    path.join(cacheDir, 'cache-index.json'),
    JSON.stringify({
      version: 1,
      updatedAt: fetchedAt,
      entries: [
        {
          kind: 'projects',
          path: 'projects.json',
          updatedAt: fetchedAt,
        },
        {
          kind: 'conversations',
          path: 'conversations.json',
          updatedAt: fetchedAt,
        },
        {
          kind: 'context',
          path: 'contexts/ab30a4a92e4b65a9.json',
          updatedAt: fetchedAt,
          conversationId: 'ab30a4a92e4b65a9',
        },
      ],
    }),
    'utf8',
  );

  if (options?.withSqliteArtifactParity) {
    const sqliteModule = await import('node:sqlite');
    const dbPath = path.join(cacheDir, 'cache.sqlite');
    const db = new sqliteModule.DatabaseSync(dbPath);
    try {
      db.exec(`
        CREATE TABLE cache_entries (
          dataset TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (dataset, entity_id)
        );
        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE source_links (
          id INTEGER PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          message_id TEXT,
          url TEXT NOT NULL,
          title TEXT,
          domain TEXT,
          source_group TEXT,
          source_type TEXT,
          snippet TEXT,
          cited_text TEXT,
          message_index INTEGER,
          ordinal INTEGER,
          metadata_json TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE file_assets (
          asset_id TEXT PRIMARY KEY,
          provider_file_id TEXT,
          storage_relpath TEXT,
          absolute_path TEXT,
          mime_type TEXT,
          byte_size INTEGER,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE file_bindings (
          dataset TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          provider TEXT,
          provider_file_id TEXT,
          display_name TEXT,
          mime_type TEXT,
          source TEXT,
          local_path TEXT,
          asset_id TEXT,
          metadata_json TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (dataset, entity_id, file_id)
        );
        CREATE TABLE artifact_bindings (
          conversation_id TEXT NOT NULL,
          artifact_id TEXT NOT NULL,
          provider TEXT,
          message_id TEXT,
          message_index INTEGER,
          kind TEXT,
          title TEXT,
          summary TEXT,
          mime_type TEXT,
          uri TEXT,
          local_path TEXT,
          metadata_json TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (conversation_id, artifact_id)
        );
      `);
      db.prepare(
        'INSERT INTO cache_entries (dataset, entity_id, payload_json, fetched_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        'conversation-context',
        'ab30a4a92e4b65a9',
        JSON.stringify({ conversationId: 'ab30a4a92e4b65a9' }),
        fetchedAt,
        fetchedAt,
      );
      db.prepare(
        'INSERT INTO artifact_bindings (conversation_id, artifact_id, provider, message_id, message_index, kind, title, uri, metadata_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'ab30a4a92e4b65a9',
        'artifact_sheet_1',
        'gemini',
        'msg_artifact_1',
        1,
        'spreadsheet',
        'AGENTS extraction',
        'sandbox:/mnt/data/agents.csv',
        JSON.stringify({ format: 'csv', source: 'gemini' }),
        fetchedAt,
      );
      db.prepare(
        'INSERT INTO artifact_bindings (conversation_id, artifact_id, provider, message_id, message_index, kind, title, uri, metadata_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'orphan-conversation',
        'artifact_orphan_1',
        'gemini',
        'msg_orphan_1',
        0,
        'generated',
        'Orphan artifact',
        'sandbox:/mnt/data/orphan.txt',
        JSON.stringify({ source: 'gemini' }),
        fetchedAt,
      );
    } finally {
      db.close();
    }
  }
  return auracallHome;
}

describe('gemini cache CLI parity', () => {
  test('cache listing accepts gemini provider and reports Gemini cache entries', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', '--provider', 'gemini'],
        { env },
      );
      const payload = parseJsonPayload(stdout) as Array<{ provider: string; identityKey: string; kind: string }>;
      expect(payload).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'gemini', identityKey: 'tester@example.com', kind: 'projects' }),
          expect.objectContaining({
            provider: 'gemini',
            identityKey: 'tester@example.com',
            kind: 'conversations',
            inventorySummary: expect.objectContaining({
              conversationCount: 1,
              messageCount: 2,
              sourceCount: 1,
              fileCount: 1,
              artifactCount: 1,
            }),
          }),
        ]),
      );
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache export accepts gemini provider', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const exportDir = path.join(auracallHome, 'exports-out');
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: exportStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'export',
          '--provider',
          'gemini',
          '--scope',
          'projects',
          '--format',
          'json',
          '--output',
          exportDir,
        ],
        { env },
      );
      expect(exportStdout).toContain('Exported');
      expect(exportStdout).toContain(exportDir);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache context list and get stay on the requested Gemini cache identity', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: listStdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'context', 'list', '--provider', 'gemini'],
        { env },
      );
      const listPayload = parseJsonPayload(listStdout) as Array<{ conversationId: string; path: string }>;
      expect(listPayload).toEqual([
        expect.objectContaining({
          conversationId: 'ab30a4a92e4b65a9',
          path: expect.stringContaining(path.join('contexts', 'ab30a4a92e4b65a9.json')),
        }),
      ]);

      const { stdout: getStdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'context', 'get', 'ab30a4a92e4b65a9', '--provider', 'gemini'],
        { env },
      );
      const getPayload = parseJsonPayload(getStdout) as {
        conversationId: string;
        provider: string;
        context: { messages: Array<{ role: string; text: string }> };
      };
      expect(getPayload).toMatchObject({
        conversationId: 'ab30a4a92e4b65a9',
        provider: 'gemini',
        context: {
          messages: [
            { role: 'user', text: 'hello cached gemini search target' },
            { role: 'assistant', text: 'hi with attached AGENTS reference' },
          ],
        },
      });
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache search and source catalog commands accept gemini provider', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: searchStdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'search', 'search target', '--provider', 'gemini'],
        { env },
      );
      const searchPayload = parseJsonPayload(searchStdout) as {
        provider: string;
        mode: string;
        hits: Array<{ conversationId: string; role: string; snippet: string }>;
      };
      expect(searchPayload.provider).toBe('gemini');
      expect(searchPayload.mode).toBe('keyword');
      expect(searchPayload.hits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            conversationId: 'ab30a4a92e4b65a9',
            role: 'user',
            snippet: expect.stringContaining('cached gemini search target'),
          }),
          expect.objectContaining({
            conversationId: 'ab30a4a92e4b65a9',
            role: 'source',
            snippet: expect.stringContaining('AGENTS guide'),
          }),
        ]),
      );

      const { stdout: sourcesStdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'sources', 'list', '--provider', 'gemini', '--domain', 'example.com'],
        { env },
      );
      const sourcesPayload = parseJsonPayload(sourcesStdout) as {
        provider: string;
        identityKey: string;
        count: number;
        rows: Array<{ conversationId: string; url: string; title: string; sourceGroup: string }>;
      };
      expect(sourcesPayload).toMatchObject({
        provider: 'gemini',
        identityKey: 'tester@example.com',
        count: 1,
      });
      expect(sourcesPayload.rows).toEqual([
        expect.objectContaining({
          conversationId: 'ab30a4a92e4b65a9',
          url: 'https://example.com/agents',
          title: 'AGENTS guide',
          sourceGroup: 'Searched web',
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache files catalog commands accept gemini provider', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: filesStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'files',
          'list',
          '--provider',
          'gemini',
          '--dataset',
          'conversation-context',
          '--query',
          'AGENTS.md',
          '--resolve-paths',
        ],
        { env },
      );
      const filesPayload = parseJsonPayload(filesStdout) as {
        provider: string;
        count: number;
        rows: Array<{ dataset: string; displayName: string; providerFileId: string; localPath: string }>;
      };
      expect(filesPayload.provider).toBe('gemini');
      expect(filesPayload.count).toBe(1);
      expect(filesPayload.rows).toEqual([
        expect.objectContaining({
          dataset: 'conversation-context',
          displayName: 'AGENTS.md',
          providerFileId: 'file_agents_md',
          localPath: path.join(auracallHome, 'cache', 'providers', 'gemini', 'tester@example.com', 'missing', 'AGENTS.md'),
        }),
      ]);

      const { stdout: resolveStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'files',
          'resolve',
          '--provider',
          'gemini',
          '--dataset',
          'conversation-context',
          '--query',
          'AGENTS.md',
          '--missing-only',
        ],
        { env },
      );
      const resolvePayload = parseJsonPayload(resolveStdout) as {
        provider: string;
        summary: { missingLocal: number };
        rows: Array<{ displayName: string; pathState: string }>;
      };
      expect(resolvePayload.provider).toBe('gemini');
      expect(resolvePayload.summary.missingLocal).toBe(1);
      expect(resolvePayload.rows).toEqual([
        expect.objectContaining({
          displayName: 'AGENTS.md',
          pathState: 'missing_local',
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache artifacts catalog commands accept gemini provider', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'artifacts',
          'list',
          '--provider',
          'gemini',
          '--kind',
          'spreadsheet',
          '--query',
          'AGENTS extraction',
        ],
        { env },
      );
      const payload = parseJsonPayload(stdout) as {
        provider: string;
        identityKey: string;
        count: number;
        rows: Array<{
          artifactId: string;
          conversationId: string;
          title: string;
          kind: string;
          uri: string;
          messageId: string;
          metadata: { format: string; source: string };
        }>;
      };
      expect(payload).toMatchObject({
        provider: 'gemini',
        identityKey: 'tester@example.com',
        count: 1,
      });
      expect(payload.rows).toEqual([
        expect.objectContaining({
          artifactId: 'artifact_sheet_1',
          conversationId: 'ab30a4a92e4b65a9',
          title: 'AGENTS extraction',
          kind: 'spreadsheet',
          uri: 'sandbox:/mnt/data/agents.csv',
          messageId: 'msg_artifact_1',
          metadata: {
            format: 'csv',
            source: 'gemini',
          },
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache doctor reports orphan artifact bindings for gemini cache state', async () => {
    const auracallHome = await seedGeminiCacheHome({ withSqliteArtifactParity: true });
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'doctor', '--provider', 'gemini', '--json'],
        { env },
      );
      const payload = parseJsonPayload(stdout) as {
        summary: { warnings: number };
        entries: Array<{
          provider: string;
          inventorySummary: {
            conversationCount: number;
            messageCount: number;
            sourceCount: number;
            fileCount: number;
            artifactCount: number;
          };
          parity: { orphanArtifactBindingsCount: number };
          findings: Array<{ check: string; message: string }>;
        }>;
      };
      expect(payload.summary.warnings).toBeGreaterThan(0);
      expect(payload.entries).toEqual([
        expect.objectContaining({
          provider: 'gemini',
          inventorySummary: expect.objectContaining({
            conversationCount: 1,
            messageCount: 2,
            sourceCount: 1,
            fileCount: 1,
            artifactCount: 1,
          }),
          parity: expect.objectContaining({
            orphanArtifactBindingsCount: 1,
          }),
          findings: expect.arrayContaining([
            expect.objectContaining({
              check: 'parity.orphan_artifact_bindings',
              message: expect.stringContaining('1 artifact_bindings row(s)'),
            }),
          ]),
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache repair can prune orphan artifact bindings for gemini cache state', async () => {
    const auracallHome = await seedGeminiCacheHome({ withSqliteArtifactParity: true });
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: dryRunStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'repair',
          '--provider',
          'gemini',
          '--actions',
          'prune-orphan-artifact-bindings',
          '--json',
        ],
        { env },
      );
      const dryRunPayload = parseJsonPayload(dryRunStdout) as {
        mode: 'dry-run' | 'apply';
        entries: Array<{
          actions: Array<{ name: string; skipped: string; message: string }>;
        }>;
      };
      expect(dryRunPayload.mode).toBe('dry-run');
      expect(dryRunPayload.entries[0]?.actions).toEqual([
        expect.objectContaining({
          name: 'prune-orphan-artifact-bindings',
          skipped: 'dry-run',
          message: expect.stringContaining('Would prune 1 orphan artifact_bindings row(s).'),
        }),
      ]);

      const { stdout: applyStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'repair',
          '--provider',
          'gemini',
          '--actions',
          'prune-orphan-artifact-bindings',
          '--apply',
          '--yes',
          '--json',
        ],
        { env },
      );
      const applyPayload = parseJsonPayload(applyStdout) as {
        mode: 'dry-run' | 'apply';
        summary: { touched: number; errors: number };
        entries: Array<{
          actions: Array<{ name: string; applied: boolean; message: string }>;
        }>;
      };
      expect(applyPayload.mode).toBe('apply');
      expect(applyPayload.summary.errors).toBe(0);
      expect(applyPayload.summary.touched).toBe(1);
      expect(applyPayload.entries[0]?.actions).toEqual([
        expect.objectContaining({
          name: 'prune-orphan-artifact-bindings',
          applied: true,
          message: expect.stringContaining('Pruned 1 orphan artifact_bindings row(s).'),
        }),
      ]);

      const { stdout: doctorStdout } = await execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, 'cache', 'doctor', '--provider', 'gemini', '--json'],
        { env },
      );
      const doctorPayload = parseJsonPayload(doctorStdout) as {
        entries: Array<{
          parity: { orphanArtifactBindingsCount: number };
          findings: Array<{ check: string }>;
        }>;
      };
      expect(doctorPayload.entries[0]?.parity.orphanArtifactBindingsCount).toBe(0);
      expect(doctorPayload.entries[0]?.findings.some((finding) => finding.check === 'parity.orphan_artifact_bindings')).toBe(
        false,
      );
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache clear reports inventory before and after for gemini cache state', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: dryRunStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'clear',
          '--provider',
          'gemini',
          '--dataset',
          'context',
          '--json',
        ],
        { env },
      );
      const dryRunPayload = parseJsonPayload(dryRunStdout) as {
        mode: 'dry-run' | 'apply';
        entries: Array<{
          inventoryBefore: { conversationCount: number; messageCount: number; sourceCount: number; fileCount: number; artifactCount: number };
          inventoryAfter: { conversationCount: number; messageCount: number; sourceCount: number; fileCount: number; artifactCount: number };
        }>;
      };
      expect(dryRunPayload.mode).toBe('dry-run');
      expect(dryRunPayload.entries).toEqual([
        expect.objectContaining({
          inventoryBefore: {
            conversationCount: 1,
            messageCount: 2,
            sourceCount: 1,
            fileCount: 1,
            artifactCount: 1,
          },
          inventoryAfter: {
            conversationCount: 1,
            messageCount: 2,
            sourceCount: 1,
            fileCount: 1,
            artifactCount: 1,
          },
        }),
      ]);

      const { stdout: applyStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'clear',
          '--provider',
          'gemini',
          '--dataset',
          'context',
          '--yes',
          '--json',
        ],
        { env },
      );
      const applyPayload = parseJsonPayload(applyStdout) as {
        mode: 'dry-run' | 'apply';
        entries: Array<{
          inventoryBefore: { conversationCount: number; messageCount: number };
          inventoryAfter: { conversationCount: number; messageCount: number };
        }>;
      };
      expect(applyPayload.mode).toBe('apply');
      expect(applyPayload.entries).toEqual([
        expect.objectContaining({
          inventoryBefore: expect.objectContaining({
            conversationCount: 1,
            messageCount: 2,
          }),
          inventoryAfter: expect.objectContaining({
            conversationCount: 0,
            messageCount: 0,
          }),
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);

  test('cache cleanup reports inventory before and after for gemini cache state', async () => {
    const auracallHome = await seedGeminiCacheHome();
    const env = {
      ...process.env,
      AURACALL_HOME_DIR: auracallHome,
      AURACALL_DISABLE_KEYTAR: '1',
    };

    try {
      const { stdout: dryRunStdout } = await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          'cache',
          'cleanup',
          '--provider',
          'gemini',
          '--older-than',
          '2026-04-06T00:00:00.000Z',
          '--json',
        ],
        { env },
      );
      const dryRunPayload = parseJsonPayload(dryRunStdout) as {
        mode: 'dry-run' | 'apply';
        entries: Array<{
          inventoryBefore: { conversationCount: number; messageCount: number; sourceCount: number; fileCount: number; artifactCount: number };
          inventoryAfter: { conversationCount: number; messageCount: number; sourceCount: number; fileCount: number; artifactCount: number };
        }>;
      };
      expect(dryRunPayload.mode).toBe('dry-run');
      expect(dryRunPayload.entries).toEqual([
        expect.objectContaining({
          inventoryBefore: {
            conversationCount: 1,
            messageCount: 2,
            sourceCount: 1,
            fileCount: 1,
            artifactCount: 1,
          },
          inventoryAfter: {
            conversationCount: 1,
            messageCount: 2,
            sourceCount: 1,
            fileCount: 1,
            artifactCount: 1,
          },
        }),
      ]);
    } finally {
      await rm(auracallHome, { recursive: true, force: true });
    }
  }, INTEGRATION_TIMEOUT);
});
