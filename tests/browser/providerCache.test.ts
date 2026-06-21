import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  matchProjectByName,
  readConversationCache,
  writeConversationCache,
  writeConversationContextCache,
} from '../../src/browser/providers/cache.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { JsonCacheStore, SqliteCacheStore } from '../../src/browser/llmService/cache/store.js';
import { upsertCacheIndexEntry } from '../../src/browser/llmService/cache/index.js';

describe('provider cache nested writes', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('creates nested directories for conversation context cache files', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    try {
      await writeConversationContextCache(context, 'conversation-123', {
        provider: 'grok',
        conversationId: 'conversation-123',
        messages: [{ role: 'user', text: 'hello' }],
      });
      const written = await readFile(
        path.join(
          homeDir,
          'cache',
          'providers',
          'grok',
          'cache-test@example.com',
          'contexts',
          'conversation-123.json',
        ),
        'utf8',
      );
      expect(JSON.parse(written)).toMatchObject({
        items: {
          provider: 'grok',
          conversationId: 'conversation-123',
        },
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('writes project-scoped conversation caches into a project-specific file', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: { projectId: 'project-123' },
      identityKey: 'cache-test@example.com',
    };
    try {
      await writeConversationCache(context, [
        {
          id: 'conversation-123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          projectId: 'project-123',
        },
      ]);
      const written = await readFile(
        path.join(
          homeDir,
          'cache',
          'providers',
          'grok',
          'cache-test@example.com',
          'project-conversations',
          'project-123.json',
        ),
        'utf8',
      );
      expect(JSON.parse(written)).toMatchObject({
        items: [
          {
            id: 'conversation-123',
            title: 'AuraCall Maple Ledger',
            projectId: 'project-123',
          },
        ],
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('marks cache stale when the provider feature signature changes', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'chatgpt',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
      featureSignature: '{"detector":"chatgpt-feature-probe-v1","apps":["github"]}',
    };
    try {
      await writeConversationCache(context, [
        {
          id: 'conversation-123',
          title: 'Artifacts',
          provider: 'chatgpt',
        },
      ]);
      const reread = await readConversationCache({
        ...context,
        featureSignature: '{"detector":"chatgpt-feature-probe-v1","apps":["github","slack"]}',
      });
      expect(reread.items).toHaveLength(1);
      expect(reread.stale).toBe(true);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('overwrites provider JSON cache files via atomic replacement', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'chatgpt',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const cacheDir = path.join(
      homeDir,
      'cache',
      'providers',
      'chatgpt',
      'cache-test@example.com',
    );
    const cacheFile = path.join(cacheDir, 'conversations.json');
    try {
      await writeConversationCache(context, [
        {
          id: 'conversation-1',
          title: 'First',
          provider: 'chatgpt',
        },
      ]);
      await writeConversationCache(context, [
        {
          id: 'conversation-2',
          title: 'Second',
          provider: 'chatgpt',
        },
      ]);

      const written = JSON.parse(await readFile(cacheFile, 'utf8')) as {
        items: Array<{ id: string; title: string }>;
      };
      expect(written.items).toEqual([{ id: 'conversation-2', title: 'Second', provider: 'chatgpt' }]);
      expect((await readdir(cacheDir)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('cache index upsert salvages and rewrites appended JSON corruption', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'chatgpt',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const cacheDir = path.join(
      homeDir,
      'cache',
      'providers',
      'chatgpt',
      'cache-test@example.com',
    );
    const indexPath = path.join(cacheDir, 'cache-index.json');
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(
        indexPath,
        `${JSON.stringify(
          {
            version: 1,
            updatedAt: '2026-06-10T00:00:00.000Z',
            entries: [
              {
                kind: 'conversation-files',
                path: 'conversation-files/old.json',
                conversationId: 'old',
                updatedAt: '2026-06-10T00:00:00.000Z',
              },
            ],
          },
          null,
          2,
        )}{${JSON.stringify({
          kind: 'conversation-files',
          path: 'conversation-files/orphan.json',
          conversationId: 'orphan',
          updatedAt: '2026-06-10T00:00:01.000Z',
        }).slice(1)}`,
        'utf8',
      );

      await upsertCacheIndexEntry(context, {
        kind: 'account-mirror',
        path: 'account-mirror/snapshot.json',
      });

      const rewritten = await readFile(indexPath, 'utf8');
      const parsed = JSON.parse(rewritten) as {
        entries: Array<{ kind: string; path: string; conversationId?: string }>;
      };
      expect(parsed.entries).toEqual([
        expect.objectContaining({
          kind: 'conversation-files',
          path: 'conversation-files/old.json',
          conversationId: 'old',
        }),
        expect.objectContaining({
          kind: 'account-mirror',
          path: 'account-mirror/snapshot.json',
        }),
      ]);
      expect(rewritten).not.toContain('orphan.json');
      expect((await readdir(cacheDir)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('json cache store enriches global Grok conversations with stronger project-scoped titles', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const globalContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const projectContext: ProviderCacheContext = {
      ...globalContext,
      listOptions: { projectId: 'project-123' },
    };
    const store = new JsonCacheStore();
    try {
      await store.writeConversations(globalContext, [
        { id: 'conversation-123', title: 'Chat', provider: 'grok' },
      ]);
      await store.writeConversations(projectContext, [
        {
          id: 'conversation-123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          projectId: 'project-123',
          url: 'https://grok.com/c/conversation-123',
        },
      ]);
      const cached = await store.readConversations(globalContext);
      expect(cached.items).toEqual([
        {
          id: 'conversation-123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          projectId: 'project-123',
          url: 'https://grok.com/c/conversation-123',
        },
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('sqlite cache store enriches global Grok conversations with stronger project-scoped titles', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const globalContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const projectContext: ProviderCacheContext = {
      ...globalContext,
      listOptions: { projectId: 'project-123' },
    };
    const store = new SqliteCacheStore();
    try {
      await store.writeConversations(globalContext, [
        { id: 'conversation-123', title: 'Chat', provider: 'grok' },
      ]);
      await store.writeConversations(projectContext, [
        {
          id: 'conversation-123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          projectId: 'project-123',
          url: 'https://grok.com/c/conversation-123',
        },
      ]);
      const cached = await store.readConversations(globalContext);
      expect(cached.items).toEqual([
        {
          id: 'conversation-123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          projectId: 'project-123',
          url: 'https://grok.com/c/conversation-123',
        },
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});

describe('project cache matching', () => {
  test('does not fuzzy-match short project names into longer names', () => {
    const projects = [
      { id: 'soylei', name: 'SoyLei', provider: 'chatgpt' as const },
      { id: 'transcripts', name: 'Transcripts', provider: 'chatgpt' as const },
    ];

    expect(matchProjectByName(projects, 'Lei')).toEqual({
      match: null,
      candidates: [],
    });
  });
});
