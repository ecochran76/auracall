import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  writeConversationCache,
  writeConversationContextCache,
} from '../../src/browser/providers/cache.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { JsonCacheStore, SqliteCacheStore } from '../../src/browser/llmService/cache/store.js';

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
