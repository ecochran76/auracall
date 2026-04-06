import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  writeConversationContextCache,
  type ProviderCacheContext,
} from '../../src/browser/providers/cache.js';
import { SqliteCacheStore } from '../../src/browser/llmService/cache/store.js';
import {
  listCachedArtifacts,
  listCachedConversationInventory,
  listCachedFiles,
  listCachedSources,
} from '../../src/browser/llmService/cache/catalog.js';

function makeContext(identityKey = 'cache-test@example.com'): ProviderCacheContext {
  return {
    provider: 'chatgpt',
    userConfig: {} as ProviderCacheContext['userConfig'],
    listOptions: {},
    identityKey,
  };
}

describe('cache catalog projections', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('sqlite cache store projects sources, files, and artifacts from conversation context', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-catalog-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context = makeContext();
    const store = new SqliteCacheStore();
    try {
      await store.writeConversationContext(context, 'conversation-123', {
        provider: 'chatgpt',
        conversationId: 'conversation-123',
        messages: [{ role: 'assistant', text: 'done' }],
        sources: [
          {
            url: 'https://example.com/spec',
            title: 'Spec',
            domain: 'example.com',
            messageIndex: 0,
            sourceGroup: 'Web',
          },
        ],
        files: [
          {
            id: 'file-1',
            name: 'report.csv',
            provider: 'chatgpt',
            source: 'conversation',
            remoteUrl: 'https://files.example/report.csv',
          },
        ],
        artifacts: [
          {
            id: 'artifact-1',
            title: 'Analysis Export',
            kind: 'spreadsheet',
            uri: 'sandbox:/mnt/data/analysis.csv',
            messageIndex: 0,
            messageId: 'msg-123',
            metadata: { format: 'csv' },
          },
        ],
      });

      const sources = await listCachedSources(context, { conversationId: 'conversation-123' });
      const files = await listCachedFiles(context, { conversationId: 'conversation-123' });
      const artifacts = await listCachedArtifacts(context, { conversationId: 'conversation-123' });
      const inventory = await listCachedConversationInventory(context, {
        conversationIds: ['conversation-123'],
      });
      const filteredArtifacts = await listCachedArtifacts(context, {
        conversationId: 'conversation-123',
        kind: 'spreadsheet',
        query: 'analysis',
      });

      expect(sources).toEqual([
        expect.objectContaining({
          conversationId: 'conversation-123',
          url: 'https://example.com/spec',
          title: 'Spec',
          sourceGroup: 'Web',
        }),
      ]);
      expect(files).toEqual([
        expect.objectContaining({
          conversationId: 'conversation-123',
          dataset: 'conversation-context',
          displayName: 'report.csv',
          remoteUrl: 'https://files.example/report.csv',
        }),
      ]);
      expect(artifacts).toEqual([
        expect.objectContaining({
          artifactId: 'artifact-1',
          conversationId: 'conversation-123',
          title: 'Analysis Export',
          kind: 'spreadsheet',
          uri: 'sandbox:/mnt/data/analysis.csv',
          messageId: 'msg-123',
          metadata: { format: 'csv' },
        }),
      ]);
      expect(inventory).toEqual([
        expect.objectContaining({
          conversationId: 'conversation-123',
          provider: 'chatgpt',
          messageCount: 1,
          sourceCount: 1,
          fileCount: 1,
          artifactCount: 1,
        }),
      ]);
      expect(filteredArtifacts).toEqual(artifacts);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('artifact catalog falls back to canonical context JSON when sqlite is absent', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-catalog-json-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context = makeContext('json-fallback@example.com');
    try {
      await writeConversationContextCache(context, 'conversation-456', {
        provider: 'chatgpt',
        conversationId: 'conversation-456',
        messages: [{ role: 'assistant', text: 'artifact only' }],
        artifacts: [
          {
            id: 'artifact-json-1',
            title: 'Rendered Canvas',
            kind: 'canvas',
            uri: 'canvas://rendered',
            messageIndex: 1,
            metadata: { origin: 'json-fallback' },
          },
        ],
      });

      const artifacts = await listCachedArtifacts(context, {
        conversationId: 'conversation-456',
        kind: 'canvas',
      });
      const inventory = await listCachedConversationInventory(context, {
        conversationIds: ['conversation-456'],
      });

      expect(artifacts).toEqual([
        expect.objectContaining({
          artifactId: 'artifact-json-1',
          conversationId: 'conversation-456',
          title: 'Rendered Canvas',
          kind: 'canvas',
          uri: 'canvas://rendered',
          metadata: { origin: 'json-fallback' },
        }),
      ]);
      expect(inventory).toEqual([
        expect.objectContaining({
          conversationId: 'conversation-456',
          provider: 'chatgpt',
          messageCount: 1,
          sourceCount: 0,
          fileCount: 0,
          artifactCount: 1,
        }),
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
